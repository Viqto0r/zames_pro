import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeToolError } from '../src/tool-summary.ts'

// The STATUS ICON next to a tool result must not show a green check for a call
// that did nothing. The sandbox guard THROWS, and the agent loop turns the
// throw into the result string `Error: Access outside the working directory is
// forbidden: ...` - which the prefix check already catches. But `safePath` is
// also reported without the `Error:` prefix by several call sites, and a bare
// `Sandbox: ...` denial (`eval with cd is forbidden`, `cannot verify cd
// target`, `chroot is forbidden`) starts with neither `error` nor `blocked
// by`: every such refusal was shown with a green check.
test('a sandbox refusal is an error, not a success', () => {
  assert.equal(
    looksLikeToolError(
      'Access outside the working directory is forbidden: ../x',
    ),
    true,
  )
  assert.equal(looksLikeToolError('Sandbox: eval with cd is forbidden'), true)
  assert.equal(looksLikeToolError('Sandbox: cannot verify cd target $d'), true)
  assert.equal(looksLikeToolError('Sandbox: chroot is forbidden'), true)
  // A normal result is still a success.
  assert.equal(looksLikeToolError('file contents here'), false)
  assert.equal(looksLikeToolError('(command produced no output)'), false)
})
