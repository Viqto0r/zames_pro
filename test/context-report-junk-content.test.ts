import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderContextReport } from '../src/context-command.ts'

// `/context` prints each loaded AGENTS.md / MEMORY.md with its CHARACTER count.
// The loader hands the report whatever the disk read produced, and a partially
// loaded file (an empty read, a failed parse) can leave `content` missing or
// non-string. `content.length` then THROWS `Cannot read properties of
// undefined` straight out of the command dispatcher — the whole `/context`
// report was lost over one broken file — and on an object printed
// `undefined chars`.

const empty = { skills: [], commands: [] }

test('a file with no content does not crash the report', () => {
  const out = renderContextReport({
    ...empty,
    agents: [{ path: 'a.md', content: undefined as never }],
    memory: [],
  })
  assert.match(out, /a\.md/)
  assert.match(out, /\(0 chars\)/)
})

test('a non-string content is not counted as undefined', () => {
  const out = renderContextReport({
    ...empty,
    agents: [],
    memory: [{ path: 'm.md', content: { x: 1 } as never }],
  })
  assert.equal(/undefined/.test(out), false, out)
})

test('a normal file keeps its real count', () => {
  const out = renderContextReport({
    ...empty,
    agents: [{ path: 'a.md', content: 'hello' }],
    memory: [],
  })
  assert.match(out, /\(5 chars\)/)
})
