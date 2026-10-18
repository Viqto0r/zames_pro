// summarizeDiagnostics() collapses a check's output. tsc's WATCH banner
// ("Found 0 errors. Watching for file changes.") is a CLEAN result, but the
// "no errors" guard only accepted a banner shorter than 40 chars — the real
// line is longer, so every edit in `--watch` mode appended a useless
// "diagnostics: Found 0 errors…" block to the model's tool result.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeDiagnostics } from '../src/diagnostics.ts'

test('the watch-mode zero-error banner is clean however long it is', () => {
  assert.equal(
    summarizeDiagnostics('Found 0 errors. Watching for file changes.', 4000),
    null,
  )
})

test('"0 problems" from eslint is clean', () => {
  assert.equal(
    summarizeDiagnostics('0 problems (0 errors, 0 warnings)', 4000),
    null,
  )
})

// The clean-banner check anchors at the START of a line, so a banner with a
// leading timestamp (`[12:00:00] Found 0 errors…`) or ANSI colour codes was
// NOT recognized as clean and every edit in watch mode appended a pointless
// diagnostics block to the tool result. "No errors found." (the trailing-word
// order) was missed too.
test('a clean banner with a timestamp or ANSI prefix is clean', () => {
  const ESC = String.fromCharCode(27)
  assert.equal(
    summarizeDiagnostics(
      '[12:00:00] Found 0 errors. Watching for file changes.',
      4000,
    ),
    null,
  )
  assert.equal(
    summarizeDiagnostics(
      ESC + '[32mFound 0 errors.' + ESC + '[39m Watching for file changes.',
      4000,
    ),
    null,
  )
  assert.equal(summarizeDiagnostics('No errors found.', 4000), null)
})
