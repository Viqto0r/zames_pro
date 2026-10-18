import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertCommandInsideRoot } from '../src/shell.js'

// The sandbox scanner looks for the cd builtin with the target separated by
// whitespace. A shell ALSO accepts cd glued to its target (cd.., cd$HOME,
// cd../..), and sh runs that as a real directory change. The scanner missed
// those forms, so a glued cd../.. left the project root and the guard never
// fired.
const root = '/root/proj'

function denies(cmd: string): boolean {
  try {
    assertCommandInsideRoot(root, cmd)
    return false
  } catch {
    return true
  }
}

test('sandbox: a glued cd target is still scanned', () => {
  assert.equal(denies('cd../..'), true, 'cd../.. must be rejected')
  assert.equal(denies('cd..'), true, 'cd.. must be rejected')
  assert.equal(
    denies('cd../../etc && ls'),
    true,
    'a glued escaping cd must be rejected',
  )
})

test('sandbox: a glued cd to HOME is scanned', () => {
  assert.equal(denies('cd$HOME'), true, 'cd$HOME leaves the root')
})

test('sandbox: a legitimate glued cd inside the root still passes', () => {
  assert.equal(denies('cdsub && ls'), false)
  assert.equal(denies('cd sub && ls'), false)
})
