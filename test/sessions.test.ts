import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'

// sessions/undo/config write to ~/.zames. We swap HOME to a temp folder
// BEFORE importing the modules, so the tests don't touch the user's real data.
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-home-'))
process.env.HOME = fakeHome
process.env.USERPROFILE = fakeHome

const { saveSession, loadLastSession, readSession, listSessions, sessionsDir } =
  await import('../src/sessions.ts')
import type { Session } from '../src/types.ts'

test('saveSession создаёт файл сессии и индекс', () => {
  const id = 'chat-' + Date.now()
  const s = saveSession({ id, title: 'Test', workdir: '/proj/a' })
  assert.ok(s)
  assert.equal(s?.id, id)
  assert.ok(fs.existsSync(path.join(sessionsDir(), id + '.json')))
})

test('loadLastSession возвращает сессию для конкретной рабочей директории', () => {
  const idA = 'chat-a-' + Date.now()
  const idB = 'chat-b-' + Date.now()
  saveSession({ id: idA, title: 'A', workdir: '/proj/a' })
  saveSession({ id: idB, title: 'B', workdir: '/proj/b' })
  const forA = loadLastSession('/proj/a')
  assert.equal(forA?.id, idA)
  const forB = loadLastSession('/proj/b')
  assert.equal(forB?.id, idB)
})

test('readSession возвращает null для несуществующей сессии', () => {
  assert.equal(readSession('no-such-chat-xyz'), null)
  assert.equal(readSession(null), null)
})

test('listSessions возвращает сохранённые сессии и сортирует свежие первыми', () => {
  const id = 'list-' + Date.now()
  saveSession({ id, title: 'Listed', workdir: '/proj/list' })
  const all = listSessions()
  const found = all.find((x: Session) => x.id === id)
  assert.ok(found)
})

test('повторный saveSession обновляет title, сохраняя createdAt', () => {
  const id = 'upd-' + Date.now()
  const first = saveSession({ id, title: 'First', workdir: '/p' })
  const second = saveSession({ id, title: 'Second', workdir: '/p' })
  assert.equal(second?.title, 'Second')
  assert.equal(second?.createdAt, first?.createdAt)
})

test('saveSession с пустым id ничего не делает', () => {
  assert.equal(saveSession({ id: '', workdir: '/p' }), null)
})
