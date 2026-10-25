import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  loadSkills,
  loadCommands,
  loadProjectContext,
  skillBody,
  MAX_FILE_BASE,
  MAX_MEMORY_FILE,
} from '../src/context.ts'
import { makeTmpDir } from './tmp-dir.ts'

async function mkTmp(t: {
  after: (fn: () => unknown) => unknown
}): Promise<string> {
  return await makeTmpDir(t, 'zames-ctx-')
}

test('loadSkills finds project skills and parses frontmatter', async (t) => {
  const root = await mkTmp(t)
  const dir = path.join(root, '.zames', 'skills', 'my-skill')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    '---\nname: my-skill\ndescription: Does a thing. Use when testing.\n---\n\n# Steps\n\n1. Do it\n',
    'utf-8',
  )
  const skills = await loadSkills(root)
  const s = skills.find((x) => x.name === 'my-skill')
  assert.ok(s, 'skill should be found')
  assert.equal(s!.description, 'Does a thing. Use when testing.')
  assert.equal(s!.source, 'project')
  assert.equal(s!.userInvokable, true)
})

test('loadSkills parses allowed-tools and user-invokable', async (t) => {
  const root = await mkTmp(t)
  const dir = path.join(root, '.claude', 'skills', 'ro')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    '---\nname: ro\ndescription: read only\nallowed-tools: Read, Grep\nuser-invokable: false\n---\nbody',
    'utf-8',
  )
  const skills = await loadSkills(root)
  const s = skills.find((x) => x.name === 'ro')
  assert.ok(s)
  assert.deepEqual(s!.allowedTools, ['Read', 'Grep'])
  assert.equal(s!.userInvokable, false)
})

test('loadSkills includes built-in skills with an inline body', async (t) => {
  const root = await mkTmp(t)
  const skills = await loadSkills(root)
  const commit = skills.find((x) => x.name === 'commit')
  assert.ok(commit, 'built-in commit skill should be present')
  assert.equal(commit!.path, '')
  assert.ok((commit!.builtinBody || '').length > 0)
  assert.equal(commit!.userInvokable, true)
})

// The five methodology skills are baked into BUILTIN_SKILLS (not shipped as
// .zames/skills/*/SKILL.md files, which never reach the npm package), so a
// fresh install has them. Guard against them being dropped: each must appear
// as a built-in with an inline body and a non-empty description.
test('the methodology skills are built in (superpowers port)', async (t) => {
  const root = await mkTmp(t)
  const skills = await loadSkills(root)
  const methodology = [
    'brainstorming',
    'writing-plans',
    'test-driven-development',
    'systematic-debugging',
    'verification-before-completion',
  ]
  for (const name of methodology) {
    const s = skills.find((x) => x.name === name)
    assert.ok(s, name + ' should be a built-in skill')
    assert.equal(s!.path, '', name + ' should have no file path')
    assert.ok(
      (s!.builtinBody || '').length > 100,
      name + ' should carry a real inline body',
    )
    assert.ok(
      (s!.description || '').length > 0,
      name + ' should have a description',
    )
  }
})

test('a project skill overrides a built-in with the same name', async (t) => {
  const root = await mkTmp(t)
  const dir = path.join(root, '.zames', 'skills', 'commit')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    '---\nname: commit\ndescription: my own commit flow\n---\ncustom body',
    'utf-8',
  )
  const skills = await loadSkills(root)
  const commit = skills.find((x) => x.name === 'commit')
  assert.ok(commit)
  assert.equal(commit!.source, 'project')
  assert.equal(commit!.description, 'my own commit flow')
  assert.equal(commit!.builtinBody, undefined)
})

test('loadCommands reads .zames/commands/*.md', async (t) => {
  const root = await mkTmp(t)
  const dir = path.join(root, '.zames', 'commands')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'review.md'),
    '---\ndescription: review the diff\n---\nReview $ARGUMENTS carefully.',
    'utf-8',
  )
  const cmds = await loadCommands(root)
  const c = cmds.find((x) => x.name === 'review')
  assert.ok(c)
  assert.equal(c!.description, 'review the diff')
  assert.match(c!.body, /Review \$ARGUMENTS carefully/)
})

test('loadProjectContext picks up AGENTS.md and MEMORY.md', async (t) => {
  const root = await mkTmp(t)
  await fs.writeFile(
    path.join(root, 'AGENTS.md'),
    '# Rules\n\n- be nice',
    'utf-8',
  )
  await fs.writeFile(path.join(root, 'MEMORY.md'), '- remembered fact', 'utf-8')
  const ctx = await loadProjectContext(root)
  assert.ok(ctx.agents.some((f) => f.path.endsWith('AGENTS.md')))
  assert.ok(ctx.memory.some((f) => f.path.endsWith('MEMORY.md')))
  assert.match(ctx.agents[0].content, /be nice/)
})

// An EXISTING but 0-byte AGENTS.md was dropped by a truthiness check,
// so the prompt lost the file entirely. It must appear as an (empty) section.
test('an empty AGENTS.md is still injected as an (empty) section', async (t) => {
  const root = await mkTmp(t)
  await fs.writeFile(path.join(root, 'AGENTS.md'), '', 'utf-8')
  const ctx = await loadProjectContext(root)
  const f = ctx.agents.find((x) => x.path.endsWith('AGENTS.md'))
  assert.ok(f, 'an empty AGENTS.md must not be dropped')
  assert.equal(f!.content, '')
})

test('skillBody strips frontmatter', () => {
  const raw = '---\nname: x\n---\n\nhello world'
  assert.equal(skillBody(raw), 'hello world')
})

test('skillBody: closing --- at EOF without a trailing newline', () => {
  // The frontmatter closes on the LAST line with no final newline: the body
  // must be empty, not the whole file (a past bug returned the entire input).
  const raw = '---\nname: x\n---'
  const body = skillBody(raw)
  assert.ok(!body.includes('name: x'), 'frontmatter leaked: ' + body)
  assert.equal(body, '')
  // With a real body after a newline-terminated close.
  assert.equal(skillBody('---\nname: x\n---\nBODY'), 'BODY')
})

// MEMORY.md is appended to over time, so its newest notes live at the TAIL.
// A file over the per-file budget must keep the tail (the newest notes), not
// clip them away with a head slice.
test('an oversized MEMORY.md keeps its newest (tail) notes', async (t) => {
  const root = await mkTmp(t)
  const head = 'OLD-'.repeat(60000) // ~240k of stale notes at the top
  const tail = '\n- NEWEST-FACT-KEEP-ME\n'
  await fs.writeFile(path.join(root, 'MEMORY.md'), head + tail, 'utf-8')
  const ctx = await loadProjectContext(root)
  const f = ctx.memory.find((x) => x.path.endsWith('MEMORY.md'))
  assert.ok(f, 'MEMORY.md must be present')
  assert.match(f!.content, /NEWEST-FACT-KEEP-ME/, 'the newest note survives')
  assert.ok(
    f!.content.length <= MAX_MEMORY_FILE,
    'clipped to the memory per-file budget',
  )
})

// The tail clip must not cut a note in half: it starts at a bullet/heading
// boundary so the kept text is a sequence of whole notes.
test('a tail clip starts at a note boundary, not mid-note', async (t) => {
  const root = await mkTmp(t)
  const filler = ('x'.repeat(79) + '\n').repeat(3000) // ~240k
  // Newest notes are clearly delimited bullets.
  const notes = '\n- NOTE-A\n- NOTE-B\n- NOTE-C\n'
  await fs.writeFile(path.join(root, 'MEMORY.md'), filler + notes, 'utf-8')
  const ctx = await loadProjectContext(root)
  const f = ctx.memory.find((x) => x.path.endsWith('MEMORY.md'))!
  assert.match(f.content, /NOTE-A/)
  // The first kept CONTENT line (after the marker) is a whole bullet, not a
  // leftover fragment of the filler run.
  const afterMarker = f.content.split('...]')[1] || ''
  const firstLine = afterMarker.replace(/^\n+/, '').split('\n')[0]
  assert.match(
    firstLine,
    /^- /,
    'first kept line is a whole note: ' + firstLine,
  )
})

// A big AGENTS.md must NOT starve MEMORY.md: they have separate pools now.
test('a large AGENTS.md does not drop MEMORY.md from the prompt', async (t) => {
  const root = await mkTmp(t)
  await fs.writeFile(
    path.join(root, 'AGENTS.md'),
    'A'.repeat(MAX_FILE_BASE),
    'utf-8',
  )
  await fs.writeFile(path.join(root, 'MEMORY.md'), '- KEEP-MEMORY\n', 'utf-8')
  const ctx = await loadProjectContext(root)
  assert.ok(
    ctx.memory.some((f) => /KEEP-MEMORY/.test(f.content)),
    'memory must survive a full AGENTS.md',
  )
})

// A nested AGENTS.md is pulled in only when the task touches its directory.
test('loadProjectContext includes scoped AGENTS.md for touched dirs', async (t) => {
  const root = await mkTmp(t)
  await fs.mkdir(path.join(root, 'src', 'deep'), { recursive: true })
  await fs.writeFile(
    path.join(root, 'src', 'deep', 'AGENTS.md'),
    'SCOPED-RULE-42',
    'utf-8',
  )
  // Without a touched path the nested file is not loaded.
  const plain = await loadProjectContext(root)
  assert.ok(!(plain.scopedAgents || []).some((f) => /deep/.test(f.path)))
  // With a path into src/deep it is loaded.
  const scoped = await loadProjectContext(root, ['fix src/deep/util.ts'])
  assert.ok(
    (scoped.scopedAgents || []).some((f) => f.path.endsWith('AGENTS.md')),
    'nested AGENTS.md should be loaded',
  )
  assert.match(scoped.scopedAgents![0].content, /SCOPED-RULE-42/)
})

test('buildSystemPrompt renders scoped instructions in their own section', async () => {
  const { buildSystemPrompt } = await import('../src/system-prompt.ts')
  const ctx = {
    agents: [],
    scopedAgents: [{ path: '/p/src/deep/AGENTS.md', content: 'SCOPED-XYZ' }],
    memory: [],
    skills: [],
    commands: [],
  }
  const sp = buildSystemPrompt({ workdir: '/p', tools: [], context: ctx })
  assert.match(sp, /## Scoped instructions/)
  assert.match(sp, /SCOPED-XYZ/)
})

test('buildSystemPrompt includes context sections', async () => {
  const { buildSystemPrompt } = await import('../src/system-prompt.ts')
  const ctx = {
    agents: [{ path: '/p/AGENTS.md', content: 'PROJECT-RULE-XYZ' }],
    memory: [{ path: '/p/MEMORY.md', content: 'MEMORY-FACT-ABC' }],
    skills: [
      {
        name: 'demo',
        description: 'demo skill',
        path: '/p/.zames/skills/demo/SKILL.md',
        dir: '/p/.zames/skills/demo',
        source: 'project' as const,
        userInvokable: true,
      },
    ],
    commands: [
      {
        name: 'review',
        description: 'review it',
        path: '/p/.zames/commands/review.md',
        body: 'x',
      },
    ],
  }
  const sp = buildSystemPrompt({ workdir: '/p', tools: [], context: ctx })
  assert.match(sp, /PROJECT-RULE-XYZ/)
  assert.match(sp, /MEMORY-FACT-ABC/)
  assert.match(sp, /## Skills/)
  assert.match(sp, /demo: demo skill/)
  assert.match(sp, /## Custom commands/)
  assert.match(sp, /\/review/)
})

test('loadCommands parses argument-hint and arguments frontmatter', async (t) => {
  const root = await mkTmp(t)
  const dir = path.join(root, '.zames', 'commands')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'fix.md'),
    '---\ndescription: fix it\nargument-hint: <file> [focus]\narguments: file, focus\n---\nFix $file ($focus)',
    'utf-8',
  )
  const cmds = await loadCommands(root)
  const c = cmds.find((x) => x.name === 'fix')
  assert.ok(c)
  assert.equal(c!.argumentHint, '<file> [focus]')
  assert.deepEqual(c!.arguments, ['file', 'focus'])
})
