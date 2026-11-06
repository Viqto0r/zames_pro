import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseModelIntent } from '../src/model-command.ts'

// A model id is a SINGLE token. The operator's text can carry a newline (a
// paste, a wrapped line), and it was stored in the config and echoed in the
// `/model set` report VERBATIM: the break split the status/report line into a
// fake extra row.
const t = (k: string) => k

test('a model id with a newline is flattened to one line', () => {
  const r = parseModelIntent('qwen', 'qwen3\nFAKE', t as never)
  assert.equal(r.kind, 'set')
  assert.equal(
    (r as { model: string }).model.includes('\n'),
    false,
    JSON.stringify(r),
  )
})

test('a whitespace-only arg still lists', () => {
  assert.equal(parseModelIntent('qwen', '  \n ', t as never).kind, 'list')
})

test('a plain id is unchanged', () => {
  assert.deepEqual(parseModelIntent('qwen', ' glm-4.6 ', t as never), {
    kind: 'set',
    model: 'glm-4.6',
  })
})
