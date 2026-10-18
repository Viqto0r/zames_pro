// A permission rule with `command` is matched against the tool's `command`
// argument only. MCP tools name their argument whatever the server's JSON
// Schema says (`cmd`, `shell_command`, `argv`, ...), and the model sometimes
// invents a synonym. For those tools the rule silently never matched, so a
// `command` deny could be bypassed by calling a tool whose field is named
// differently.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidePermission, parsePermissions } from '../src/permissions.ts'

test('a command rule sees cmd/shell_command/argv fields', () => {
  const policy = parsePermissions({
    default: 'allow',
    rules: [{ command: 'rm -rf', action: 'deny' }],
  })
  assert.ok(policy)
  for (const args of [
    { command: 'rm -rf /' },
    { cmd: 'rm -rf /' },
    { shell_command: 'rm -rf /' },
    { script: 'rm -rf /' },
  ]) {
    assert.equal(
      decidePermission(policy, 'srv__run', args).action,
      'deny',
      JSON.stringify(args),
    )
  }
})

test('a command rule still allows a safe command', () => {
  const policy = parsePermissions({
    default: 'allow',
    rules: [{ command: 'rm -rf', action: 'deny' }],
  })
  assert.equal(
    decidePermission(policy, 'srv__run', { cmd: 'ls -la' }).action,
    'allow',
  )
})

// The comment above says `argv` is one of the names to cover, but the value
// collector accepted only STRING fields — an array argv (the natural shape for
// execFile-style MCP tools) was dropped, so a `command` deny was bypassed by
// passing the command as an ARRAY.
test('a command rule sees an argv ARRAY', () => {
  const policy = parsePermissions({
    default: 'allow',
    rules: [{ command: 'rm\\s+-rf', action: 'deny' }],
  })
  assert.ok(policy)
  assert.equal(
    decidePermission(policy, 'srv__run', { argv: ['rm', '-rf', '/'] }).action,
    'deny',
  )
  assert.equal(
    decidePermission(policy, 'srv__run', { argv: ['ls', '-la'] }).action,
    'allow',
  )
})
