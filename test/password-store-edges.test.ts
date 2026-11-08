import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePasswordStore,
  planPasswordMigration,
} from '../src/password-store.ts'

// password-store.test.ts covers the happy paths. These cases pin the CROSSED
// pairs that decide whether a password is silently dropped or stored where it
// cannot be read: a tool of ANOTHER platform must not count, an unknown
// platform never reaches the keychain, and the migration keeps the secret
// byte-for-byte (no trimming) while still warning on a degraded store.

const probe = (over: Record<string, unknown> = {}) => ({
  secretTool: false,
  security: false,
  powershell: false,
  platform: 'linux' as 'linux' | 'darwin' | 'win32' | 'other',
  ...over,
})

test('a tool of another platform does not make the keychain available', () => {
  assert.deepEqual(
    resolvePasswordStore(
      'keychain',
      probe({ platform: 'win32', secretTool: true, security: true }),
    ),
    { store: 'config', degraded: true },
  )
  assert.deepEqual(
    resolvePasswordStore(
      'keychain',
      probe({ platform: 'darwin', secretTool: true, powershell: true }),
    ),
    { store: 'config', degraded: true },
  )
  assert.deepEqual(
    resolvePasswordStore(
      'keychain',
      probe({ platform: 'linux', security: true, powershell: true }),
    ),
    { store: 'config', degraded: true },
  )
})

test('an unknown platform never reaches the keychain', () => {
  assert.deepEqual(
    resolvePasswordStore(
      'keychain',
      probe({ platform: 'other', secretTool: true, powershell: true }),
    ),
    { store: 'config', degraded: true },
  )
})

test('a non-keychain preference never degrades', () => {
  for (const p of ['config', 'none'] as const) {
    assert.deepEqual(resolvePasswordStore(p, probe({ platform: 'other' })), {
      store: p,
      degraded: false,
    })
  }
})

test('the migrated secret is moved verbatim, without trimming', () => {
  assert.deepEqual(planPasswordMigration('  x  ', 'keychain', true), {
    keychainWrite: '  x  ',
    clearConfig: true,
    warn: true,
  })
})

test('an empty password never clears the config field', () => {
  assert.deepEqual(planPasswordMigration('', 'none', true), {
    keychainWrite: null,
    clearConfig: false,
    warn: true,
  })
  assert.deepEqual(planPasswordMigration('   ', 'keychain', false), {
    keychainWrite: null,
    clearConfig: false,
    warn: false,
  })
})
