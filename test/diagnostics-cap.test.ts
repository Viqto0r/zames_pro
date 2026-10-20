import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeDiagnostics } from '../src/diagnostics.ts'

// `maxChars` is a CAP: the summary (including its truncation marker) must not
// exceed it. The marker was appended ON TOP of a head already `maxChars` long,
// so the result was ~26 chars WIDER than the configured cap on every edit.
test('summarizeDiagnostics never exceeds maxChars', () => {
  const raw = Array.from(
    { length: 400 },
    (_, i) => 'error TS100' + i + ': boom',
  ).join(String.fromCharCode(10))
  for (const cap of [200, 1000, 4000]) {
    const out = summarizeDiagnostics(raw, cap)
    assert.ok(out, 'an error log must produce a summary')
    assert.ok(
      out!.length <= cap,
      `summary is ${out!.length} chars, cap is ${cap}`,
    )
  }
})

// A SHORT error must still be returned verbatim (no needless marker).
test('a short error log is returned as-is', () => {
  const out = summarizeDiagnostics('error TS1: nope', 4000)
  assert.equal(out, 'error TS1: nope')
})
