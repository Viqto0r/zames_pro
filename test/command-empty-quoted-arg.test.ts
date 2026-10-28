// `splitCommandArgs` drops an EMPTY quoted token: `cmd a ""` and `cmd ""`
// both produce a SHORT list. `missingCommandArgs` then treats the declared
// positional as unsupplied, so a custom command whose `arguments:` include a
// parameter the operator deliberately left BLANK (an empty `$2`, the usual
// "apply the default" case) is refused with the usage hint — the command can
// never run with an empty value, and `$ARGUMENTS` also loses that position.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitCommandArgs, missingCommandArgs } from '../src/commands.ts'

const Q = String.fromCharCode(34)

test('an explicitly EMPTY quoted argument is still a supplied position', () => {
  assert.deepEqual(splitCommandArgs('a ' + Q + Q + ' b'), ['a', '', 'b'])
  assert.deepEqual(splitCommandArgs(Q + Q), [''])
})

test('missingCommandArgs sees an empty positional as supplied', () => {
  assert.deepEqual(missingCommandArgs(['x', 'y'], 'a ' + Q + Q), [])
  assert.deepEqual(missingCommandArgs(['x'], Q + Q), [])
  // A really absent position is still reported.
  assert.deepEqual(missingCommandArgs(['x', 'y'], 'a'), ['y'])
})

test('plain whitespace still separates tokens', () => {
  assert.deepEqual(splitCommandArgs('  a   b  '), ['a', 'b'])
})
