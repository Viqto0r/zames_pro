// A `path` DENY rule could be bypassed by passing the path as an ARRAY or by
// nesting it one level deeper. `collectPathCandidates` only accepted a STRING
// in the known path keys, and only scanned the TOP level of the args (and only
// for MCP tools). Real MCP tools take `files: [...]` or `{file: {path}}`, so a
// rule like {"path": "^/etc", "action": "deny"} silently allowed the call.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectPathCandidates, decidePermission } from '../src/permissions.ts'

const denyEtc = {
  default: 'allow' as const,
  rules: [{ path: '^/etc', action: 'deny' as const }],
}

test('a path argument given as an array is collected', () => {
  assert.deepEqual(collectPathCandidates('Read', { path: ['/etc/passwd'] }), [
    '/etc/passwd',
  ])
  assert.equal(
    decidePermission(denyEtc, 'Read', { path: ['/etc/passwd'] }).action,
    'deny',
  )
})

test('a nested path inside an MCP arg object is collected', () => {
  assert.deepEqual(
    collectPathCandidates('srv__read', { file: { path: '/etc/passwd' } }),
    ['/etc/passwd'],
  )
  assert.equal(
    decidePermission(denyEtc, 'srv__read', { file: { path: '/etc/passwd' } })
      .action,
    'deny',
  )
})

test('an array of paths under an arbitrary key is collected', () => {
  assert.equal(
    decidePermission(denyEtc, 'srv__read', { files: ['/etc/a', '/tmp/b'] })
      .action,
    'deny',
  )
  assert.equal(
    decidePermission(denyEtc, 'srv__read', { files: ['/tmp/a', '/tmp/b'] })
      .action,
    'allow',
  )
})

test('an argv entry that is a path is collected', () => {
  assert.equal(
    decidePermission(denyEtc, 'srv__exec', { argv: ['cat', '/etc/passwd'] })
      .action,
    'deny',
  )
})

test('a top-level string path still works', () => {
  assert.equal(
    decidePermission(denyEtc, 'Read', { path: '/etc/passwd' }).action,
    'deny',
  )
})
