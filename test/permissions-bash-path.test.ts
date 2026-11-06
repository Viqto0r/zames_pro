import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidePermission, parsePermissions } from '../src/permissions.ts'

// A permission rule may carry a `command` regex and a `path` regex. A `path`
// rule is written for FILE-TOUCHING tools, but the operator naturally writes it
// for the tool that most often touches a path — `Bash`:
//
//   { "tool": "^Bash$", "path": "^/etc/", "action": "deny" }
//
// The command line was scanned only for `command` rules, so the same path a
// moment later (`cat /etc/passwd`) matched NOTHING and the call was ALLOWED —
// a guard that does not guard. The path candidates of a shell command are its
// ARGUMENTS (the words after the program name), and they must be offered to a
// path rule like any file path.

const policy = parsePermissions({
  rules: [{ tool: '^Bash$', path: '^\\/etc\\/', action: 'deny' }],
})

test('a path rule matches a path used as a Bash argument', () => {
  const d = decidePermission(policy, 'Bash', { command: 'cat /etc/passwd' })
  assert.equal(d.action, 'deny', JSON.stringify(d))
})

test('a Bash command WITHOUT the guarded path is still allowed', () => {
  assert.equal(
    decidePermission(policy, 'Bash', { command: 'cat ./README.md' }).action,
    'allow',
  )
  assert.equal(
    decidePermission(policy, 'Bash', { command: 'ls -la' }).action,
    'allow',
  )
})

test('the path is found anywhere in the command line', () => {
  assert.equal(
    decidePermission(policy, 'Bash', { command: 'cp a.txt /etc/x' }).action,
    'deny',
  )
  assert.equal(
    decidePermission(policy, 'Bash', { command: 'ls && cat /etc/hosts' })
      .action,
    'deny',
  )
})

test('a command-only tool is not affected by the path scan', () => {
  const commandRule = parsePermissions({
    rules: [{ tool: '^Bash$', command: 'rm -rf', action: 'deny' }],
  })
  assert.equal(
    decidePermission(commandRule, 'Bash', { command: 'ls /etc' }).action,
    'allow',
  )
  assert.equal(
    decidePermission(commandRule, 'Bash', { command: 'rm -rf /etc' }).action,
    'deny',
  )
})
