import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertCommandInsideRoot } from '../src/shell.ts'

// A `cd` hidden inside a COMMAND SUBSTITUTION or a nested shell is executed
// by the shell exactly like a top-level `cd`. The static scan only knows the
// separators `;`, `&`, `|`, `(`, a backtick and whitespace — NOT `$(` (whose
// closing `)` ends the target) nor `sh -c '...'`. Both forms walked out of the
// root with the guard silent.
const root = '/workspaces/zames/zames_pro'

test('cd inside $( ) is refused or resolved, never ignored', () => {
  for (const cmd of [
    'echo $(cd / && ls)',
    'echo `cd / && ls`',
    'sh -c "cd / && ls"',
    'bash -c "cd / && ls"',
  ]) {
    assert.throws(
      () => assertCommandInsideRoot(root, cmd),
      /Sandbox/,
      'not blocked: ' + cmd,
    )
  }
})

test('an ordinary command is still allowed', () => {
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'npm test'))
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'cd sub && npm test'))
})
