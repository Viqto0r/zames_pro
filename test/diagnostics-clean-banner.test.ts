// summarizeDiagnostics() collapses a check's output. tsc's WATCH banner
// ("Found 0 errors. Watching for file changes.") is a CLEAN result, but the
// "no errors" guard only accepted a banner shorter than 40 chars — the real
// line is longer, so every edit in `--watch` mode appended a useless
// "diagnostics: Found 0 errors…" block to the model's tool result.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeDiagnostics } from '../src/diagnostics.ts'

test('tsc watch banner with zero errors is clean', () => {
  assert.equal(
    summarizeDiagnostics('Found 0 errors. Watching for file changes.', 4000),
    null,
  )
})

test('a real tsc error is still reported', () => {
  const raw =
    "src/a.ts(1,2): error TS2322: Type 'string' is not assignable to type 'number'."
  const out = summarizeDiagnostics(raw, 4000)
  assert.ok(out && out.includes('TS2322'), String(out))
})

test('"0 problems" from eslint is clean', () => {
  assert.equal(
    summarizeDiagnostics('0 problems (0 errors, 0 warnings)', 4000),
    null,
  )
})
