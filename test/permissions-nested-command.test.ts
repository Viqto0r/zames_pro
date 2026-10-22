// A `command` DENY rule was only checked against the TOP-LEVEL args:
// `decidePermission` read `args.command` / `args.cmd` / ... directly. An MCP
// tool (or a model that nests its payload) sends `{args: {command: '...'}}` or
// `{input: {params: {cmd: '...'}}}`, and the deny rule silently ALLOWED the
// call - the operator wrote a guard and it did not fire. Paths were already
// collected through nested objects for MCP tools; commands were not.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidePermission } from '../src/permissions.ts'

const denyRm = {
  default: 'allow' as const,
  rules: [{ command: 'rm -rf', action: 'deny' as const }],
}

test('a command nested one level deeper still matches', () => {
  assert.equal(
    decidePermission(denyRm, 'mcp__shell__exec', {
      args: { command: 'rm -rf /' },
    }).action,
    'deny',
  )
})

test('a command nested two levels deeper still matches', () => {
  assert.equal(
    decidePermission(denyRm, 'mcp__x__y', {
      input: { params: { cmd: 'rm -rf /' } },
    }).action,
    'deny',
  )
})

test('a nested command that does not match the rule is allowed', () => {
  assert.equal(
    decidePermission(denyRm, 'mcp__x__y', {
      input: { params: { cmd: 'ls -la' } },
    }).action,
    'allow',
  )
})

test('an argv array nested in an object still matches', () => {
  assert.equal(
    decidePermission(denyRm, 'mcp__exec', {
      args: { argv: ['rm', '-rf', '/'] },
    }).action,
    'deny',
  )
})
