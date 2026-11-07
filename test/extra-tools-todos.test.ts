import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createTodoStore,
  getTodos,
  resetTodos,
  setTodos,
  renderTodos,
  normalizeTodos,
  parsePatch,
} from '../src/extraTools.ts'

const NL = String.fromCharCode(10)

// src/extraTools.ts owns the TodoWrite store/rendering and the ApplyPatch
// parser. The patch hunks have their own files; this one pins the CORE todo
// contract (an injected store, a copy out, the status normalization, the
// render marks) and the patch header/fence guard.

test('an injected store starts empty and is independent', () => {
  const a = createTodoStore()
  const b = createTodoStore()
  setTodos([{ content: 'one', status: 'pending' }], a)
  assert.equal(getTodos(a).length, 1)
  assert.equal(getTodos(b).length, 0)
})

test('getTodos returns COPIES, so a caller cannot mutate the store', () => {
  const store = createTodoStore()
  setTodos([{ content: 'one', status: 'pending' }], store)
  const got = getTodos(store)
  got[0].content = 'hacked'
  assert.equal(getTodos(store)[0].content, 'one')
})

test('setTodos normalizes and notifies onChange with a copy', () => {
  const seen: unknown[] = []
  const store = createTodoStore((items) => seen.push(items))
  setTodos(
    [
      { content: '  a  ', status: 'done' },
      { text: 'b', status: 'active' },
      { content: '   ', status: 'pending' },
    ] as never,
    store,
  )
  assert.deepEqual(getTodos(store), [
    { content: 'a', status: 'completed' },
    { content: 'b', status: 'in_progress' },
  ])
  assert.equal(seen.length, 1)
  // The callback got a COPY, not the live array.
  assert.notEqual(seen[0], store.items)
})

test('setTodos REPLACES the list instead of appending', () => {
  const store = createTodoStore()
  setTodos([{ content: 'a', status: 'pending' }], store)
  setTodos([{ content: 'b', status: 'pending' }], store)
  assert.deepEqual(
    getTodos(store).map((t) => t.content),
    ['b'],
  )
})

test('resetTodos empties the store in place', () => {
  const store = createTodoStore()
  const arr = store.items
  setTodos([{ content: 'a', status: 'pending' }], store)
  resetTodos(store)
  assert.equal(store.items.length, 0)
  assert.equal(store.items, arr)
})

test('normalizeTodos accepts every status alias and drops an empty item', () => {
  const out = normalizeTodos([
    { content: 'x', status: 'completed' },
    { content: 'y', status: 'done' },
    { content: 'z', status: 'in_progress' },
    { content: 'w', status: 'active' },
    { content: 'v', status: 'whatever' },
    { content: 'u' },
    { content: '' },
    null,
  ])
  assert.deepEqual(
    out.map((t) => t.status),
    [
      'completed',
      'completed',
      'in_progress',
      'in_progress',
      'pending',
      'pending',
    ],
  )
})

test('renderTodos reports the done count and the marks', () => {
  const text = renderTodos([
    { content: 'a', status: 'completed' },
    { content: 'b', status: 'in_progress' },
    { content: 'c', status: 'pending' },
  ])
  assert.ok(text.startsWith('Todo list (1/3 done):'))
  assert.ok(text.includes('1. [x] a'))
  assert.ok(text.includes('2. [~] b'))
  assert.ok(text.includes('3. [ ] c'))
})

test('renderTodos says so when the list is empty', () => {
  assert.equal(renderTodos([]), 'Todo list is empty.')
})

test('parsePatch rejects a body without the Begin/End markers', () => {
  assert.equal(parsePatch('').error, 'Patch must start with "*** Begin Patch".')
  assert.equal(
    parsePatch('*** Begin Patch' + NL + 'x').error,
    'Patch must end with "*** End Patch".',
  )
})

test('parsePatch reads the three op headers', () => {
  const body = [
    '*** Begin Patch',
    '*** Add File: a.txt',
    '+hello',
    '*** Update File: b.txt',
    '@@',
    ' old',
    '-old',
    '+new',
    '*** Delete File: c.txt',
    '*** End Patch',
  ].join(NL)
  const { ops, error } = parsePatch(body)
  assert.equal(error, undefined)
  assert.deepEqual(
    ops.map((o) => [o.op, o.file]),
    [
      ['add', 'a.txt'],
      ['update', 'b.txt'],
      ['delete', 'c.txt'],
    ],
  )
})
