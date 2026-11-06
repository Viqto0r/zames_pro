import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandCommandArgs } from '../src/commands.ts'

// `expandCommandArgs` parks every `{{args}}` under a control-character key
// (`\x1fa<i>\x1f`) and restores it after the positional pass. A command BODY
// that already contains such a key — a binary snippet, a control-char dump —
// is indistinguishable from a generated placeholder, so the restore replaced
// the body's own text with the operator's arguments. The comment above the
// restore promises the opposite ("a body that DOES contain it is left
// untouched").

const US = String.fromCharCode(0x1f)

test('a body that already contains a placeholder-shaped key is left alone', () => {
  const body = 'data: ' + US + 'a0' + US + ' end'
  const out = expandCommandArgs(body, 'ARGS', [])
  assert.equal(out, body)
})

test('a real {{args}} is still substituted', () => {
  assert.equal(expandCommandArgs('run {{args}}', 'x', []), 'run x')
})
