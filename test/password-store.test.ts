import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePasswordStore,
  planPasswordMigration,
  keychainAccount,
} from '../src/password-store.ts'

// N21: where the provider password lives. The rules: a keychain is used only
// when its tool really exists (otherwise degrade WITH a warning, never drop the
// password), and a migration moves the secret instead of duplicating it.

const probe = (over = {}) => ({
  secretTool: false,
  security: false,
  powershell: false,
  platform: 'linux' as const,
  ...over,
})

test('the default stores stay as they are', () => {
  assert.deepEqual(resolvePasswordStore('config', probe()), {
    store: 'config',
    degraded: false,
  })
  assert.deepEqual(resolvePasswordStore('none', probe()), {
    store: 'none',
    degraded: false,
  })
})

test('keychain is used only when the platform tool exists', () => {
  assert.equal(
    resolvePasswordStore('keychain', probe({ secretTool: true })).store,
    'keychain',
  )
  assert.equal(
    resolvePasswordStore(
      'keychain',
      probe({ platform: 'darwin', security: true }),
    ).store,
    'keychain',
  )
  assert.equal(
    resolvePasswordStore(
      'keychain',
      probe({ platform: 'win32', powershell: true }),
    ).store,
    'keychain',
  )
})

test('a missing tool degrades to config WITH a warning', () => {
  assert.deepEqual(resolvePasswordStore('keychain', probe()), {
    store: 'config',
    degraded: true,
  })
})

test('migrating to the keychain moves the secret and clears the config', () => {
  assert.deepEqual(planPasswordMigration('secret', 'keychain', false), {
    keychainWrite: 'secret',
    clearConfig: true,
    warn: false,
  })
})

test('the "do not store" mode clears an existing password', () => {
  assert.deepEqual(planPasswordMigration('secret', 'none', false), {
    keychainWrite: null,
    clearConfig: true,
    warn: false,
  })
})

test('the config store keeps the password in place', () => {
  assert.deepEqual(planPasswordMigration('secret', 'config', false), {
    keychainWrite: null,
    clearConfig: false,
    warn: false,
  })
})

test('an empty or missing password has nothing to migrate', () => {
  assert.deepEqual(planPasswordMigration(null, 'keychain', false), {
    keychainWrite: null,
    clearConfig: false,
    warn: false,
  })
  assert.deepEqual(planPasswordMigration('   ', 'none', false), {
    keychainWrite: null,
    clearConfig: false,
    warn: false,
  })
})

test('a degraded store warns even when there is nothing to move', () => {
  assert.equal(planPasswordMigration(null, 'config', true).warn, true)
})

test('the keychain account is namespaced per provider', () => {
  assert.equal(keychainAccount('deepseek'), 'zames:deepseek')
})
