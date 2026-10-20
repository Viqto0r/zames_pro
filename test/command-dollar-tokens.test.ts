import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandCommandArgs, missingCommandArgs } from '../src/commands.ts'

// A custom command body is a PROMPT for the model. Besides `$ARGUMENTS` it can
// carry `$1`, `$2`, `$name` — and also ordinary PROSE starting with a dollar
// sign in front of a word (a shell snippet, "costs $100", a variable name the
// operator wants the model to see).
//
// The positional substitution must NOT eat `$100` as "position 100" (it was
// replaced with an empty string, silently deleting the number from the prompt)
// and must leave an UNDECLARED `$foo` in place (it already did).
test('a $NUMBER beyond the supplied positions is left untouched', () => {
  const out = expandCommandArgs('budget is $100 for this task', 'a b')
  assert.ok(
    out.includes('$100'),
    'a number past the position count must survive: ' + out,
  )
})

test('a bare dollar before a word stays as written', () => {
  const out = expandCommandArgs('run echo $HOME here', 'x')
  assert.ok(out.includes('$HOME'), 'undeclared $NAME must survive: ' + out)
})

test('declared positions and $1 still substitute', () => {
  const out = expandCommandArgs('file=$1 name=$target', 'a.txt b.txt', [
    'file',
    'target',
  ])
  assert.equal(out, 'file=a.txt name=b.txt')
})

test('missingCommandArgs reports an unsupplied position', () => {
  assert.deepEqual(missingCommandArgs(['a', 'b'], 'only'), ['b'])
  assert.deepEqual(missingCommandArgs(['a'], 'x'), [])
  assert.deepEqual(missingCommandArgs(undefined, ''), [])
})
