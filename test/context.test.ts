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
  await fs.writeFile(path.join(root, 'AGENTS.md'), '# Rules\n\n- be nice', 'utf-8')
  await fs.writeFile(path.join(root, 'MEMORY.md'), '- remembered fact', 'utf-8')
  const ctx = await loadProjectContext(root)
  assert.ok(ctx.agents.some((f) => f.path.endsWith('AGENTS.md')))
  assert.ok(ctx.memory.some((f) => f.path.endsWith('MEMORY.md')))
  assert.match(ctx.agents[0].content, /be nice/)
})

test('skillBody strips frontmatter', () => {
  const raw = '---\nname: x\n---\n\nhello world'
  assert.equal(skillBody(raw), 'hello world')
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
    commands: [{ name: 'review', description: 'review it', path: '/p/.zames/commands/review.md', body: 'x' }],
  }
  const sp = buildSystemPrompt({ workdir: '/p', tools: [], context: ctx })
  assert.match(sp, /PROJECT-RULE-XYZ/)
  assert.match(sp, /MEMORY-FACT-ABC/)
  assert.match(sp, /## Skills/)
  assert.match(sp, /demo: demo skill/)
  assert.match(sp, /## Custom commands/)
  assert.match(sp, /\/review/)
})
