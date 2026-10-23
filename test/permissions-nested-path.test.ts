// A `path` rule must cover the path a tool call really carries. The scanner
// reads the known top-level keys (`path`, `file_path`, ...) and only recurses
// into ARBITRARY shapes for MCP tools (`server__tool`). A built-in-looking call
// that nests the same path (`{file: {path}}`, `{files: [...]}` — what a model
// writes when it invents an argument shape) slipped past a `path` deny rule
// and ran anyway, i.e. the operator's policy was silently widened.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decidePermission,
  collectPathCandidates,
  type PermissionPolicy,
} from '../src/permissions.js'

const policy: PermissionPolicy = {
  default: 'allow',
  rules: [{ tool: '^Write$', path: '^/etc/', action: 'deny' }],
}

test('a nested/array path argument is collected for a built-in tool too', () => {
  const nested = collectPathCandidates('Write', {
    file: { path: '/etc/passwd' },
  })
  assert.ok(
    nested.includes('/etc/passwd'),
    'nested path must be collected: ' + JSON.stringify(nested),
  )
  const arr = collectPathCandidates('Write', { files: ['/etc/passwd'] })
  assert.ok(arr.includes('/etc/passwd'), 'array path must be collected')
})

test('a deny path rule is not bypassed by nesting the path', () => {
  const d = decidePermission(policy, 'Write', {
    file: { path: '/etc/passwd' },
  })
  assert.equal(d.action, 'deny')
})

test('a normal flat path still matches (control)', () => {
  assert.equal(
    decidePermission(policy, 'Write', { path: '/etc/passwd' }).action,
    'deny',
  )
})
