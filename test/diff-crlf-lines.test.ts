import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unifiedDiff } from '../src/diff.ts'

// `unifiedDiff` splits BOTH sides on the bare LF. A file saved with CRLF
// line endings (Windows, a pasted snippet) therefore keeps a `\r` at the END
// of every line, so the SAME text with different line endings is reported as
// EVERY line removed and re-added — the undo preview showed a whole-file
// change for a file the operator never touched, and the model was told
// everything changed.
//
// Line endings must be normalized before the diff.

const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)

test('a CRLF file compared with an LF file is not a whole-file change', () => {
  assert.equal(unifiedDiff('a' + CR + NL + 'b', 'a' + NL + 'b'), '')
})

test('a lone CR is a line break too', () => {
  assert.equal(unifiedDiff('a' + CR + 'b', 'a' + NL + 'b'), '')
})

test('a real change is still reported', () => {
  assert.equal(unifiedDiff('a' + NL + 'b', 'a' + NL + 'c'), '-b' + NL + '+c')
})
