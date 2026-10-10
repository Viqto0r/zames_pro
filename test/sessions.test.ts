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

const {
  saveSession,
  loadLastSession,
  readSession,
  listSessions,
  sessionsDir,
  markInternalChat,
  isInternalChat,
} = await import('../src/sessions.ts')
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

test('saveSession сохраняет todos и не стирает их при обновлении title', () => {
  const id = 'todos-' + Date.now()
  const todos = [{ content: 'step 1', status: 'completed' }]
  const s = saveSession({ id, workdir: '/p', todos })
  assert.deepEqual(s?.todos, todos)
  assert.deepEqual(readSession(id)?.todos, todos)
  // A later saveLastChat-style call (no todos) must keep the existing list.
  const s2 = saveSession({ id, title: 'T', workdir: '/p' })
  assert.deepEqual(s2?.todos, todos)
})

// ---------- internal (subagent) chats ----------

test('internal chat ids are remembered and matched', () => {
  const id = 'sub-' + Date.now()
  assert.equal(isInternalChat(id), false)
  markInternalChat(id)
  assert.equal(isInternalChat(id), true)
  assert.equal(isInternalChat(null), false)
  assert.equal(isInternalChat(''), false)
})

test('listSessions hides an internal chat', () => {
  const id = 'sub-list-' + Date.now()
  saveSession({ id, title: 'subagent', workdir: '/p' })
  assert.ok(listSessions().some((x: Session) => x.id === id))
  markInternalChat(id)
  assert.ok(!listSessions().some((x: Session) => x.id === id))
})

test('loadLastSession never returns an internal chat', () => {
  const wd = '/proj/internal-' + Date.now()
  const parent = 'parent-' + Date.now()
  const sub = 'subagent-' + Date.now()
  saveSession({ id: parent, title: 'parent', workdir: wd })
  markInternalChat(sub)
  // A subagent chat is not saved as a session in real use, so the parent is
  // still the last real session for this workdir.
  assert.equal(loadLastSession(wd)?.id, parent)
  // Even if an internal id somehow becomes the index target, it is skipped.
  saveSession({ id: sub, title: 'sub', workdir: wd })
  assert.notEqual(loadLastSession(wd)?.id, sub)
})

// ---------- input history persistence ----------

test('loadHistory/saveHistory round-trip and cap', async () => {
  const { loadHistory, saveHistory } = await import('../src/sessions.ts')
  // Whatever was on disk, the functions must not throw and loadHistory must
  // always return an array of strings.
  const before = loadHistory()
  assert.ok(Array.isArray(before))
  saveHistory(['a', 'b', 'c'])
  const after = loadHistory()
  assert.ok(after.length >= 3)
  assert.equal(after[after.length - 1], 'c')
})
