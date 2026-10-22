// runShell() is called from two places with a command that is NOT passed
// through req(): the operator's `!command` escape (src/index.ts) and the Bash
// tool after req() accepted a whitespace-only string. Node's exec REJECTS an
// empty file argument SYNCHRONOUSLY (`ERR_INVALID_ARG_VALUE: The argument
// 'file' cannot be empty`), so the throw escaped the promise: the Bash tool
// crashed the tool call and `!` typed with nothing after it killed the input
// loop instead of reporting an empty command.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runShell } from '../src/shell.ts'

const NL = String.fromCharCode(10)

test('runShell answers an EMPTY command instead of throwing', async () => {
  const out = await runShell(process.cwd(), '')
  assert.equal(out, '(command produced no output)')
})

test('runShell answers a WHITESPACE-only command instead of throwing', async () => {
  const out = await runShell(process.cwd(), '   ' + NL + '\t')
  assert.equal(out, '(command produced no output)')
})

test('runShell still runs a real command', async () => {
  const out = await runShell(process.cwd(), 'echo hello')
  assert.equal(out.trim(), 'hello')
})
