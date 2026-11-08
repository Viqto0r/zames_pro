import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { makeTmpDirSync } from './tmp-dir.ts'

// saveSession() MERGES into an existing file: saveLastChat() calls it for the
// title/workdir only, so a later call must not wipe the checklist, the creation
// stamp or the provider, and must not resurrect the todos when none are passed.
// Every case uses its OWN workdir so nothing races the shared index.

const fakeHome = makeTmpDirSync(
  {
    on: (e: string, fn: () => unknown) => {
      if (e === 'end') after(fn)
    },
  },
  'zames-home-merge-',
)
process.env.HOME = fakeHome
process.env.USERPROFILE = fakeHome

const { saveSession, readSession, sessionsDir } =
  await import('../src/sessions.ts')

const uid = (p: string): string => p + '-' + Date.now() + '-' + Math.random()

test('an empty id is not saved', () => {
  assert.equal(saveSession({ id: '', title: 'x' }), null)
})

test('a later call keeps the title, workdir and createdAt it did not pass', () => {
  const id = uid('keep')
  const first = saveSession({ id, title: 'First', workdir: '/p/keep' })
  assert.ok(first)
  const again = saveSession({ id })
  assert.equal(again?.title, 'First')
  assert.equal(again?.workdir, '/p/keep')
  assert.equal(again?.createdAt, first?.createdAt)
  assert.notEqual(again?.updatedAt, first?.updatedAt)
})

test('the provider survives a call that does not pass one', () => {
  const id = uid('prov')
  saveSession({ id, title: 't', workdir: '/p/prov', provider: 'qwen' })
  const again = saveSession({ id, title: 't2' })
  assert.equal(again?.provider, 'qwen')
  assert.equal(readSession(id)?.provider, 'qwen')
})

test('a new provider overrides the stored one', () => {
  const id = uid('prov2')
  saveSession({ id, workdir: '/p/prov2', provider: 'deepseek' })
  assert.equal(saveSession({ id, provider: 'glm' })?.provider, 'glm')
})

test('the checklist survives a title-only save', () => {
  const id = uid('todos')
  const todos = [
    { content: 'a', status: 'pending' },
    { content: 'b', status: 'done' },
  ]
  saveSession({ id, title: 't', workdir: '/p/todos', todos })
  saveSession({ id, title: 't2' })
  assert.deepEqual(readSession(id)?.todos, todos)
})

test('an explicit empty checklist clears the stored one', () => {
  const id = uid('todos-clear')
  saveSession({
    id,
    workdir: '/p/tc',
    todos: [{ content: 'a', status: 'pending' }],
  })
  saveSession({ id, todos: [] })
  assert.deepEqual(readSession(id)?.todos, [])
})

test('a corrupt session file is replaced, not thrown on', () => {
  const id = uid('corrupt')
  const file = path.join(sessionsDir(), id + '.json')
  fs.mkdirSync(sessionsDir(), { recursive: true })
  fs.writeFileSync(file, '{not json')
  const s = saveSession({ id, title: 'fresh', workdir: '/p/corrupt' })
  assert.equal(s?.title, 'fresh')
  assert.equal(readSession(id)?.title, 'fresh')
})

test('the version stamp is written on every save', () => {
  const id = uid('ver')
  const s = saveSession({ id, workdir: '/p/ver' })
  assert.equal(typeof s?.version, 'number')
})
