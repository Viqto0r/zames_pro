// summarizeDiagnostics() treats a `Found 0 errors` / `0 problems` banner as a
// CLEAN run and returns null. That check runs on the WHOLE text, so a mixed
// output — a watch-mode banner PLUS a real error line (webpack prints
// `ERROR in …` and its own `Found 0 errors` summary) — was reported as clean
// and the model never saw the error.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeDiagnostics } from '../src/diagnostics.ts'

const NL = String.fromCharCode(10)

test('a zero banner does not hide a real error line', () => {
  const raw = 'ERROR in ./src/a.ts 3:1' + NL + 'Found 0 errors' + NL
  const out = summarizeDiagnostics(raw, 4000)
  assert.ok(out, 'the error was swallowed by the banner')
  assert.match(out!, /ERROR in/)
})

test('a truly clean banner still returns null (control)', () => {
  assert.equal(summarizeDiagnostics('Found 0 errors. Watching.', 4000), null)
})
