import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderContextSection } from '../src/system-prompt.ts'

// renderContextSection turns the loaded AGENTS.md / MEMORY / scoped rules /
// skills / custom commands into prompt blocks. The size budget and the
// no-newline guards have their own files; this one pins the STRUCTURE: one
// section per source, the deepest MEMORY as the append target, the built-in
// skill marker and the one-line descriptions.

const NL = String.fromCharCode(10)

function ctx(over: Record<string, unknown> = {}): never {
  return {
    agents: [],
    memory: [],
    scopedAgents: [],
    skills: [],
    commands: [],
    ...over,
  } as never
}

test('no context renders nothing', () => {
  assert.equal(renderContextSection(null), '')
  assert.equal(renderContextSection(undefined), '')
  assert.equal(renderContextSection(ctx()), '')
})

test('each AGENTS.md gets its own section with the path', () => {
  const out = renderContextSection(
    ctx({ agents: [{ path: '/proj/AGENTS.md', content: 'be nice' }] }),
  )
  assert.ok(out.includes('## Project instructions (/proj/AGENTS.md)'))
  assert.ok(out.includes('be nice'))
})

test('MEMORY points the append instruction at the DEEPEST file', () => {
  const out = renderContextSection(
    ctx({
      memory: [
        { path: '/home/u/.zames/MEMORY.md', content: 'global' },
        { path: '/proj/MEMORY.md', content: 'project' },
      ],
    }),
  )
  assert.ok(out.includes('/proj/MEMORY.md via Edit/Write'))
  assert.equal(out.includes('/home/u/.zames/MEMORY.md via'), false)
})

test('a scoped rule names its directory and stays a separate section', () => {
  const out = renderContextSection(
    ctx({ scopedAgents: [{ path: '/proj/sub/AGENTS.md', content: 'local' }] }),
  )
  assert.ok(out.includes('## Scoped instructions (/proj/sub/AGENTS.md)'))
  assert.ok(out.includes('ONLY to files under /proj/sub'))
})

test('a skill with a path shows the file, a built-in says so', () => {
  const out = renderContextSection(
    ctx({
      skills: [
        { name: 'one', description: 'd1', path: '/s/one/SKILL.md' },
        { name: 'two', description: 'd2' },
      ],
    }),
  )
  assert.ok(out.includes('## Skills'))
  assert.ok(out.includes('file: /s/one/SKILL.md'))
  assert.ok(out.includes('(built-in)'))
  // The discipline paragraph rides along with the section.
  assert.match(out, /scan the list above for a matching skill/)
})

test('a multi-line skill description is collapsed to one line', () => {
  const out = renderContextSection(
    ctx({
      skills: [
        {
          name: 'x',
          description: 'line one' + NL + '## fake section',
          path: '/a',
        },
      ],
    }),
  )
  assert.equal(out.includes(NL + '## fake section'), false)
  assert.ok(out.includes('line one ## fake section'))
})

test('a skill without a description gets the placeholder', () => {
  const out = renderContextSection(ctx({ skills: [{ name: 'x', path: '/a' }] }))
  assert.ok(out.includes('(no description)'))
})

test('a skill with allowed tools lists them', () => {
  const out = renderContextSection(
    ctx({
      skills: [
        {
          name: 'x',
          description: 'd',
          path: '/a',
          allowedTools: ['Read', 'Bash'],
        },
      ],
    }),
  )
  assert.ok(out.includes('[tools: Read, Bash]'))
})

test('custom commands are listed with their slash name', () => {
  const out = renderContextSection(
    ctx({ commands: [{ name: 'deploy', description: 'ship it' }] }),
  )
  assert.ok(out.includes('## Custom commands'))
  assert.ok(out.includes('- /deploy: ship it'))
})

test('a command without a description gets the placeholder', () => {
  const out = renderContextSection(ctx({ commands: [{ name: 'x' }] }))
  assert.ok(out.includes('- /x: (no description)'))
})
