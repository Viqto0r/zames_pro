import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runFile } from '../src/shell.ts'

// `runFile` passed `timeout` STRAIGHT to execFile, which validates it
// SYNCHRONOUSLY and throws `ERR_OUT_OF_RANGE` for a negative, fractional or
// non-numeric value. The throw escaped the promise, so the caller crashed
// instead of getting a tool result — the same bug the shell runner already
// guards against. A limit is normalized: a bad value falls back to the default.
test('runFile: a negative timeout does not throw out of the promise', async () => {
  const out = await runFile(process.cwd(), process.execPath, ['-e', '1'], -5)
  assert.equal(typeof out, 'string')
})

test('runFile: a NaN timeout falls back instead of throwing', async () => {
  const out = await runFile(process.cwd(), process.execPath, ['-e', '1'], NaN)
  assert.equal(typeof out, 'string')
})

test('runFile: a fractional timeout is floored, not rejected', async () => {
  const out = await runFile(
    process.cwd(),
    process.execPath,
    ['-e', 'console.log("ok")'],
    5000.7,
  )
  assert.equal(out, 'ok')
})
