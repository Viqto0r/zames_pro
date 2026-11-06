import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeToolError } from '../src/tool-summary.ts'

// `looksLikeToolError` decides the STATUS ICON of a tool result. It classifies
// by the HEAD (first 60 chars, lowercased) for most families, so a result
// whose FIRST line is a heading and whose error sits on a LATER line was
// shown with a GREEN check — including the shell's own timeout line
// (`⏱ Timeout 15000ms`), which is written FIRST when a command is killed.
//
// A timeout / a killed process is never a success.

const NL = String.fromCharCode(10)

test('the shell timeout line is an error', () => {
  assert.equal(looksLikeToolError('⏱ Timeout 15000ms'), true)
})

test('a heading before an Error line is still an error', () => {
  assert.equal(
    looksLikeToolError('Build output' + NL + 'Error: cannot find module x'),
    true,
  )
})

test('an anchored Exit code line still counts', () => {
  assert.equal(looksLikeToolError('some' + NL + 'Exit code: 1'), true)
})

test('a normal result is not an error', () => {
  assert.equal(looksLikeToolError('file contents' + NL + 'line 2'), false)
})
