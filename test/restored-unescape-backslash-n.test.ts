import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unescapeJsonString } from '../src/restore-history.ts'

// unescapeJsonString decodes the JSON escapes of a captured `respond` message
// before the restored dialogue prints it. It decodes one escape FAMILY per
// regex pass, and the ORDER matters: a JSON string holding a LITERAL backslash
// followed by `n` (`C:\\notes`, a printed `\\n`, a regex written in an answer)
// is stored as `\\\\n`; the `\\n` pass ran BEFORE the `\\\\` collapse and turned
// that pair into a real LINE BREAK, losing the backslash and reflowing the
// restored answer. JSON.parse of the same text keeps both characters.
const BS = String.fromCharCode(92)
const LF = String.fromCharCode(10)

test('a doubled backslash before n stays a backslash plus n', () => {
  const json = BS + BS + 'n'
  assert.equal(unescapeJsonString(json), BS + 'n')
  assert.equal(unescapeJsonString(json), JSON.parse('"' + json + '"'))
})

test('a Windows path ending in n keeps its shape', () => {
  const json = 'C:' + BS + BS + 'notes' + BS + BS + 'new'
  const out = unescapeJsonString(json)
  assert.equal(out, 'C:' + BS + 'notes' + BS + 'new')
  assert.equal(out.includes(LF), false)
})

test('a real newline escape still becomes a line break', () => {
  assert.equal(unescapeJsonString('a' + BS + 'nb'), 'a' + LF + 'b')
})

test('a literal backslash keeps the escape that follows it', () => {
  const json = BS + BS + 'u0041'
  assert.equal(unescapeJsonString(json), BS + 'u0041')
})
