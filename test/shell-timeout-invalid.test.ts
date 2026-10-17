// The Bash tool takes `timeout` straight from the MODEL's arguments
// (timeout: 'number?'). Node's exec validates the option SYNCHRONOUSLY and
// throws ERR_OUT_OF_RANGE for a negative, fractional or non-numeric value —
// and that throw escapes runShell, so a sloppy tool call made the Bash tool
// itself crash instead of returning an error string.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runShell } from '../src/shell.ts'

const CMD = 'echo hi'

test('runShell ignores a negative timeout instead of throwing', async () => {
  const out = await runShell(process.cwd(), CMD, -5)
  assert.equal(out.trim(), 'hi')
})

test('runShell ignores a fractional timeout instead of throwing', async () => {
  // 1.5ms floors to 1ms, which the command legitimately overruns — the point
  // is that it is ACCEPTED (no ERR_OUT_OF_RANGE), not that the command wins
  // the race.
  const out = await runShell(process.cwd(), 'echo hi', 1.5)
  assert.doesNotMatch(out, /ERR_OUT_OF_RANGE|out of range/i)
  const out2 = await runShell(process.cwd(), CMD, 1500.5)
  assert.equal(out2.trim(), 'hi')
})

test('runShell ignores a non-numeric timeout instead of throwing', async () => {
  const out = await runShell(process.cwd(), CMD, 'abc' as unknown as number)
  assert.equal(out.trim(), 'hi')
})

test('runShell still honors a valid timeout', async () => {
  const out = await runShell(process.cwd(), CMD, 5000)
  assert.equal(out.trim(), 'hi')
})
