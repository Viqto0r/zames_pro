import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dispatchKey } from '../src/tui/keys.ts'

// A raw DEL byte (0x7f) that Ink did NOT map to `key.backspace` (some
// terminals and the kitty protocol hand it over as plain `input`) passed the
// printable guard `input >= ' '` — DEL is 127 — and was INSERTED into the
// buffer as an invisible control character, which the operator then sends to
// the model. Only a REAL printable character may insert.
const ctx = { searchMode: false, bufferEmpty: false, endsWithBackslash: false }
const edge = { atTop: true, atBottom: true }

test('a raw DEL byte is not inserted as text', () => {
  const action = dispatchKey(
    String.fromCharCode(127),
    {} as never,
    ctx as never,
    edge,
  )
  assert.notEqual(action?.type, 'insert', JSON.stringify(action))
})

test('a printable character still inserts', () => {
  assert.deepEqual(dispatchKey('я', {} as never, ctx as never, edge), {
    type: 'insert',
    text: 'я',
  })
})
