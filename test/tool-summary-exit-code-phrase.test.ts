// looksLikeToolError() decides the ✔/✖ icon next to a tool result. Its
// failure markers must be the run's OWN lines: `Exit code: N` is emitted by
// runShell ONLY for a non-zero exit, and it starts a line. A phrase that merely
// APPEARS in the output (a log line, a diff, a test summary, a config value)
// is data, not a failure — an old `head.includes('exit code')` marked such a
// successful call with a red ✖.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeToolError } from '../src/tool-summary.ts'

test('a mid-line mention of a failure phrase is not an error', () => {
  assert.equal(looksLikeToolError('log: exit code 0 recorded, all good'), false)
  assert.equal(
    looksLikeToolError('note: command failed handling is retried'),
    false,
  )
})

test('the run OWN failure lines are still errors', () => {
  assert.equal(looksLikeToolError('Exit code: 1\nstderr:\nboom'), true)
  assert.equal(looksLikeToolError('prefix:\ncommand failed here'), true)
  assert.equal(looksLikeToolError('Error: ENOENT'), true)
  assert.equal(
    looksLikeToolError('\u23f1 Timeout after 30000ms \u2014 process killed.'),
    true,
  )
})

test('a normal successful result is not an error', () => {
  assert.equal(looksLikeToolError('File written: a.txt'), false)
  assert.equal(looksLikeToolError('(command produced no output)'), false)
})
