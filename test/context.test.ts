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
} from '../src/context.ts'

async function mkTmp(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'zames-ctx-'))
}

test('loadSkills finds project skills and parses frontmatter', async () => {
  const root = await mkTmp()
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

test('loadSkills parses allowed-tools and user-invokable', async () => {
  const root = await mkTmp()
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

test('loadSkills includes built-in skills with an inline body', async () => {
  const root = await mkTmp()
  const skills = await loadSkills(root)
  const commit = skills.find((x) => x.name === 'commit')
  assert.ok(commit, 'built-in commit skill should be present')
  assert.equal(commit!.path, '')
  assert.ok((commit!.builtinBody || '').length > 0)
  assert.equal(commit!.userInvokable, true)
})

test('a project skill overrides a built-in with the same name', async () => {
  const root = await mkTmp()
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

test('loadCommands reads .zames/commands/*.md', async () => {
  const root = await mkTmp()
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

test('loadProjectContext picks up AGENTS.md and MEMORY.md', async () => {
  const root = await mkTmp()
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
test('an empty AGENTS.md is still injected as an (empty) section', async () => {
  const root = await mkTmp()
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

// B6: a nested AGENTS.md is pulled in only when the task touches its directory.
test('loadProjectContext includes scoped AGENTS.md for touched dirs', async () => {
  const root = await mkTmp()
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
