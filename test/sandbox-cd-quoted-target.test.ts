// The sandbox scanner strips only a matching PAIR of quotes from the ENDS of a
// cd target (`replace(/^["']|["']$/g, '')`). The shell, however, removes EVERY
// quote in the word wherever it sits (`cd "a"/"../../.."` is one word). So a
// quoted mid-word escape — `cd "a"/"../../.."` — was compared as the literal
// `a/"/../../..` (which normalizes to `<root>/a/"`, INSIDE the root), passed
// the guard, and then ran for real and left the project.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertCommandInsideRoot } from '../src/shell.js'

const root = '/root/proj'

function denies(cmd: string): boolean {
  try {
    assertCommandInsideRoot(root, cmd)
    return false
  } catch {
    return true
  }
}

test('sandbox: quotes inside a cd target do not hide an escape', () => {
  assert.equal(denies('cd "a"/"../../.." && ls'), true)
  assert.equal(denies('cd a/".."/".." && ls'), true)
})

test('sandbox: a quoted cd target inside the root still passes', () => {
  assert.equal(denies('cd "sub dir" && ls'), false)
  assert.equal(denies('cd "sub "/.. && ls'), false)
})
