import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatExport } from '../src/commands.ts'

// The export is a MARKDOWN report whose per-event lines are a `- tool …` /
// ` -> Bash: …` LIST. A tool result (or a truncated one) with a NEWLINE was
// inserted verbatim, so its second line started at column 0 and read as a
// report line of its own — the export's structure was broken, and the real
// number of events was hidden.
const NL = String.fromCharCode(10)

test('a multi-line tool result stays on ONE line', () => {
  const out = formatExport([
    { type: 'tool_result', tool: 'Bash', result: 'line1' + NL + 'line2' },
  ])
  const lines = out.split(NL)
  assert.ok(
    !lines.includes('line2'),
    'the result broke the list: ' + JSON.stringify(out),
  )
  assert.ok(
    lines.some((l) => l.startsWith(' -> Bash: ') && l.includes('line1')),
    JSON.stringify(out),
  )
})

test('a clipped result is marked, not silently cut', () => {
  const out = formatExport([
    { type: 'tool_result', tool: 'Bash', result: 'x'.repeat(600) },
  ])
  assert.ok(
    out.includes('…'),
    'the truncation has no marker: ' + JSON.stringify(out.slice(-80)),
  )
})
