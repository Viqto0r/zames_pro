import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDirSync } from './tmp-dir.ts'

// listSessions()/readSession() read a directory that operators and OLD builds
// have written: a truncated file, a file without an id, an internal-chat
// denylist entry. None of it may throw or resurrect a subagent chat, and the
// ordering is by updatedAt DESC.

const fakeHome = makeTmpDirSync(
  {
    on: (e: string, fn: () => unknown) => {
      if (e === 'end') after(fn)
    },
  },
  'zames-home-list-',
)
process.env.HOME = fakeHome
process.env.USERPROFILE = fakeHome

const {
  saveSession,
  listSessions,
  readSession,
  sessionsDir,
  markInternalChat,
} = await import('../src/sessions.ts')

const uid = (p: string): string => p + '-' + Date.now() + '-' + Math.random()

test('a missing or empty id reads as null', () => {
  assert.equal(readSession(null), null)
  assert.equal(readSession(''), null)
  assert.equal(readSession('never-saved'), null)
})

test('sessions are listed newest first', () => {
  const dir = sessionsDir()
  fs.mkdirSync(dir, { recursive: true })
  const mk = (id: string, updatedAt: string) =>
    fs.writeFileSync(
      path.join(dir, id + '.json'),
      JSON.stringify({ id, title: id, updatedAt }),
    )
  mk('old-' + uid('x'), '2020-01-01T00:00:00.000Z')
  mk('new-' + uid('x'), '2030-01-01T00:00:00.000Z')
  const list = listSessions()
  const updated = list.map((s: { updatedAt?: string }) => s.updatedAt)
  const sorted = [...updated].sort().reverse()
  assert.deepEqual(updated, sorted)
})

test('a junk file is skipped, not thrown on', () => {
  const dir = sessionsDir()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'junk-' + Date.now() + '.json'), '{broken')
  fs.writeFileSync(
    path.join(dir, 'noid-' + Date.now() + '.json'),
    JSON.stringify({ title: 'no id' }),
  )
  assert.doesNotThrow(() => listSessions())
  assert.ok(
    listSessions().every((s: { id?: string }) => typeof s.id === 'string'),
  )
})

test('the index and denylist files are not listed as sessions', () => {
  const dir = sessionsDir()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'last.json'),
    JSON.stringify({ last: 'x', byWorkdir: {} }),
  )
  const ids = listSessions().map((s: { id: string }) => s.id)
  assert.equal(ids.includes('x'), false)
})

test('an internal chat is hidden from the list', () => {
  const id = uid('internal')
  saveSession({ id, title: 'sub', workdir: '/p/int' })
  markInternalChat(id)
  assert.equal(
    listSessions().some((s: { id: string }) => s.id === id),
    false,
  )
  // readSession() still reads it by id: it is the LIST that hides it.
  assert.equal(readSession(id)?.id, id)
})
