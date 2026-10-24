// expandCommandArgs() substitutes the operator's ARGUMENTS into a custom
// command body. The `{{args}}` / `$ARGUMENTS` placeholders are replaced with
// the RAW argument string FIRST, and the `$1..$N` / `$name` pass then scans the
// whole result — including the text that was just inserted. So an argument
// value that happens to contain `$1` is rewritten by the positional
// substitution: `/cmd real $1` sends `real real` instead of the operator's
// `real $1` (a literal price/template in the task is silently corrupted).
// The inserted arguments are DATA; only the command BODY may hold placeholders.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandCommandArgs } from '../src/commands.ts'

test('a dollar token INSIDE an argument value is not expanded again', () => {
  assert.equal(expandCommandArgs('$ARGUMENTS', 'real $1'), 'real $1')
  assert.equal(
    expandCommandArgs('body: $ARGUMENTS', 'cost is $100'),
    'body: cost is $100',
  )
})

test('placeholders in the BODY still expand', () => {
  assert.equal(expandCommandArgs('file=$1', 'a b'), 'file=a')
  assert.equal(expandCommandArgs('all: $ARGUMENTS', 'a b'), 'all: a b')
  assert.equal(expandCommandArgs('$file', 'one', ['file']), 'one')
})
