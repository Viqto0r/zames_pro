// parseTranscript used to accept ANY JSON value that typeof-ed as 'object' —
// including an ARRAY. A hand-edited/merged transcript file can carry a stray
// `[...]` line, and the entry then reached summarizeTranscript/formatExport
// where it was treated as an event. Only a plain OBJECT is a transcript event.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTranscript, summarizeTranscript } from '../src/commands.ts'

const NL = String.fromCharCode(10)

test('a JSON array line is not a transcript entry', () => {
  const body = [
    JSON.stringify({ ts: 't', type: 'user_task', task: 'x' }),
    JSON.stringify([1, 2]),
    JSON.stringify(null),
    JSON.stringify('str'),
  ].join(NL)
  const entries = parseTranscript(body)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].type, 'user_task')
})

test('summarizeTranscript ignores array junk from a transcript', () => {
  const stats = summarizeTranscript(
    parseTranscript(JSON.stringify([{ type: 'user_task' }])) as never,
  )
  assert.equal(stats.turns, 0)
})
