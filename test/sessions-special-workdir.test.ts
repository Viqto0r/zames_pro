import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { loadLastSession, saveSession, sessionsDir } from '../src/sessions.ts'

// `byWorkdir` is a plain parsed object keyed by the WORKDIR PATH. A POSIX
// directory may legally be named `__proto__`, `toString` or `constructor`, and
// those keys used to hit the PROTOTYPE: the index silently lost the entry (so
// the next launch restored ANOTHER project's chat) or read an INHERITED
// function as a chat id and probed a file named after the function SOURCE.
//
// The store is GLOBAL and shared with the other test files, so every case here
// starts from an EMPTY index and the three cases live in ONE file (a second
// file would run in parallel and race on `last.json`).

const INDEX = path.join(sessionsDir(), 'last.json')

function resetIndex(): void {
  fs.mkdirSync(sessionsDir(), { recursive: true })
  fs.writeFileSync(INDEX, '{}')
}

test('a workdir named __proto__ is an own key of the index', () => {
  resetIndex()
  saveSession({ id: 'chat-proto', title: 't', workdir: '__proto__' })
  const raw = JSON.parse(fs.readFileSync(INDEX, 'utf-8'))
  assert.equal(
    Object.prototype.hasOwnProperty.call(raw.byWorkdir, '__proto__'),
    true,
    JSON.stringify(raw.byWorkdir),
  )
  assert.equal(raw.byWorkdir['__proto__'], 'chat-proto')
  assert.equal(loadLastSession('__proto__')?.id, 'chat-proto')
})

test('a workdir named toString is an own key', () => {
  resetIndex()
  saveSession({ id: 'chat-str', title: 't', workdir: 'toString' })
  const raw = JSON.parse(fs.readFileSync(INDEX, 'utf-8'))
  assert.equal(
    Object.prototype.hasOwnProperty.call(raw.byWorkdir, 'toString'),
    true,
    JSON.stringify(Object.keys(raw.byWorkdir)),
  )
  assert.equal(loadLastSession('toString')?.id, 'chat-str')
})

test('a workdir named constructor is an own key', () => {
  resetIndex()
  saveSession({ id: 'chat-ctor', title: 't', workdir: 'constructor' })
  assert.equal(loadLastSession('constructor')?.id, 'chat-ctor')
})
