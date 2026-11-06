import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeDiagnostics } from '../src/diagnostics.ts'

// `maxChars` is a CAP. The truncation budget subtracts the marker length, and
// when the cap is SMALLER than the marker (a hand-edited `diagnostics.maxChars`
// below ~34, or a caller passing a tight budget) the budget floors at 0 and the
// result is the MARKER ALONE — 26 characters for a 10-character cap. The
// summary then overruns the tool result it was capped for.

const raw = Array.from(
  { length: 20 },
  (_, i) => 'src/a.ts(' + i + ',1): error TS2322: x',
).join(String.fromCharCode(10))

test('a tiny cap is still respected', () => {
  for (const max of [10, 20, 26, 30]) {
    const out = summarizeDiagnostics(raw, max)
    assert.ok(out, 'a summary is returned')
    assert.ok(
      out.length <= max,
      'cap ' + max + ' produced ' + out.length + ' chars',
    )
  }
})

test('a normal cap keeps the marker', () => {
  const out = summarizeDiagnostics(raw, 200)
  assert.ok(out && out.length <= 200)
  assert.match(out, /error TS2322/)
})
