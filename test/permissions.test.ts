import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  parsePermissions,
  decidePermission,
  loadPermissions,
  permissionsPath,
} from '../src/permissions.ts'

async function mkTmp(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'zames-perm-'))
}

test('parsePermissions defaults to allow with no rules', () => {
  assert.equal(parsePermissions({}), null)
  assert.equal(parsePermissions(null), null)
  assert.equal(parsePermissions('x'), null)
})

test('parsePermissions keeps valid rules and drops junk', () => {
  const p = parsePermissions({
    default: 'ask',
    rules: [
      { tool: '^Bash$2', command: 'rm -rf', action: 'deny' },
      { action: 'bogus' },
      'not-an-object',
    ],
  })
  assert.ok(p)
  assert.equal(p!.default, 'ask')
  assert.equal(p!.rules.length, 1)
  assert.equal(p!.rules[0].action, 'deny')
})

test('decidePermission returns allow with no policy', () => {
  assert.equal(
    decidePermission(null, 'Bash', { command: 'rm -rf /' }).action,
    'allow',
  )
})

test('decidePermission matches a deny rule on the command', () => {
  const policy = parsePermissions({
    rules: [{ tool: '^Bash$', command: 'rm -rf', action: 'deny' }],
  })
  const hit = decidePermission(policy, 'Bash', { command: 'rm -rf /tmp/foo' })
  assert.equal(hit.action, 'deny')
  const miss = decidePermission(policy, 'Bash', { command: 'ls' })
  assert.equal(miss.action, 'allow')
})

test('decidePermission matches a path rule', () => {
  const policy = parsePermissions({
    rules: [{ tool: '^Edit$|^Write$', path: '^\\/etc\\/', action: 'ask' }],
  })
  assert.equal(
    decidePermission(policy, 'Write', { path: '/etc/hosts' }).action,
    'ask',
  )
  assert.equal(
    decidePermission(policy, 'Write', { path: '/tmp/x' }).action,
    'allow',
  )
  // A different tool does not match the tool regex.
  assert.equal(
    decidePermission(policy, 'Read', { path: '/etc/hosts' }).action,
    'allow',
  )
})

test('decidePermission honors the default action', () => {
  const policy = parsePermissions({ default: 'deny' })
  assert.ok(policy)
  assert.equal(decidePermission(policy, 'Read', {}).action, 'deny')
})

test('bad regex in a rule never matches', () => {
  const policy = parsePermissions({
    rules: [{ tool: '([', action: 'deny' }],
  })
  assert.ok(policy)
  assert.equal(decidePermission(policy, 'Bash', {}).action, 'allow')
})

test('loadPermissions reads .zames/permissions.json', async () => {
  const root = await mkTmp()
  await fs.mkdir(path.join(root, '.zames'), { recursive: true })
  await fs.writeFile(
    permissionsPath(root),
    JSON.stringify({ rules: [{ tool: '^Bash$', action: 'deny' }] }),
  )
  const p = loadPermissions(root)
  assert.ok(p)
  assert.equal(decidePermission(p, 'Bash', {}).action, 'deny')
})

test('loadPermissions returns null for a missing or broken file', async () => {
  const root = await mkTmp()
  assert.equal(loadPermissions(root), null)
  await fs.mkdir(path.join(root, '.zames'), { recursive: true })
  await fs.writeFile(permissionsPath(root), '{ not json')
  assert.equal(loadPermissions(root), null)
})
