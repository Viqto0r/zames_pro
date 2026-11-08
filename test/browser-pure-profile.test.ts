import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDirSync } from './tmp-dir.ts'
import {
  cleanSingletonFiles,
  profileLooksLocked,
  nukeProfile,
} from '../src/browser-pure.ts'

// The profile lock handling around a browser launch: a crashed Chrome leaves
// `Singleton*` files behind, and a relaunch against them fails as "profile is
// in use". These helpers are plain fs work with an injected dir, so they are
// pinned here without a browser: the lock is DETECTED by its file, the
// singleton files are removed while everything else survives, and nuking the
// profile does not throw on a missing dir.

// Cleanup MUST be registered: an abandoned zames-* dir leaks (see
// test/tmp-dir.ts). `on:end` runs when the whole file finishes.
const ctx = {
  on: (e: 'end', fn: () => unknown) => {
    if (e === 'end') after(fn)
  },
}
const tmp = (): string => makeTmpDirSync(ctx, 'zames-profile-')

function write(dir: string, name: string): void {
  fs.writeFileSync(path.join(dir, name), 'x')
}

test('a fresh dir is not locked', async () => {
  assert.equal(await profileLooksLocked(tmp()), false)
})

test('SingletonLock marks the profile as locked', async () => {
  const dir = tmp()
  write(dir, 'SingletonLock')
  assert.equal(await profileLooksLocked(dir), true)
})

test('cleaning removes only the Singleton files', async () => {
  const dir = tmp()
  for (const n of [
    'SingletonLock',
    'SingletonCookie',
    'SingletonSocket',
    'Default',
  ]) {
    write(dir, n)
  }
  await cleanSingletonFiles(dir)
  assert.deepEqual(fs.readdirSync(dir), ['Default'])
  assert.equal(await profileLooksLocked(dir), false)
})

test('cleaning a missing dir and missing files does not throw', async () => {
  await assert.doesNotReject(cleanSingletonFiles(path.join(tmp(), 'gone')))
  await assert.doesNotReject(cleanSingletonFiles(tmp()))
})

test('nuking the profile removes the whole tree', async () => {
  const dir = tmp()
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true })
  write(path.join(dir, 'Default'), 'Preferences')
  write(dir, 'SingletonLock')
  await nukeProfile(dir)
  assert.equal(fs.existsSync(dir), false)
})

test('nuking a missing profile is a no-op, not an error', async () => {
  const gone = path.join(tmp(), 'nope')
  await assert.doesNotReject(nukeProfile(gone))
})
