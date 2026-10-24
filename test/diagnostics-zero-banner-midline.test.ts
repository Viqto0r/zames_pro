// summarizeDiagnostics() collapses a check command's output for the model.
// A ZERO-count banner (`Found 0 errors. Watching for file changes.`) must be
// treated as clean — but only when the run really carried no error. The guard
// that decides this matches an error line ANCHORED at the start of a line:
// `(^|\n)\s*(error|ERROR|✖|✗|TSnnnn)`. A normal tsc failure is
// `src/a.ts(1,1): error TS2322: …` — `error` sits MID-LINE, so the guard does
// not see it, and a stray `Found 0 errors` (a watch-mode banner left in the
// same buffer, a build log's own summary) returns null: the REAL error never
// reaches the model after an edit.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeDiagnostics } from '../src/diagnostics.ts'

test('a real tsc error is not hidden by a stray zero banner', () => {
  const raw =
    'src/a.ts(1,1): error TS2322: Type string is not assignable.\n\nFound 0 errors. Watching for file changes.'
  const out = summarizeDiagnostics(raw, 4000)
  assert.ok(out, 'the error was swallowed')
  assert.ok(out.includes('TS2322'), out)
})

test('a mid-line error word counts as an error', () => {
  const raw = 'build FAILED: error in module x\n0 problems'
  const out = summarizeDiagnostics(raw, 4000)
  assert.ok(out, 'the failure was swallowed')
})

test('a truly clean watch banner is still null', () => {
  assert.equal(
    summarizeDiagnostics('Found 0 errors. Watching for file changes.', 4000),
    null,
  )
  assert.equal(summarizeDiagnostics('', 4000), null)
})
