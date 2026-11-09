import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import {
  createExtraTools,
  createTodoStore,
  getTodos,
  resetTodos,
} from '../src/extraTools.ts'
import type { ToolDef } from '../src/types.ts'
import { makeTmpDir } from './tmp-dir.ts'

const NL = String.fromCharCode(10)

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

// The LS / MultiEdit / TodoWrite argument guards were untested: a missing or
// placeholder required argument used to become the literal string
// "undefined" and reach the fs layer, and a missing `new_string` silently
// ERASED the matched text. These tests pin the CURRENT refusals with a real
// temp dir (no browser, no network).

test('LS lists entries sorted, marks folders and sizes files', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ls-')
  await fs.writeFile(path.join(dir, 'b.txt'), 'hello', 'utf-8')
  await fs.writeFile(path.join(dir, 'a.txt'), 'xy', 'utf-8')
  await fs.mkdir(path.join(dir, 'sub'))
  const out = String(await tool(createExtraTools(dir, {}), 'LS').fn({}))
  const rows = out.split(NL)
  assert.deepEqual(rows, ['a.txt  (2 bytes)', 'b.txt  (5 bytes)', 'sub/'])
})

test('LS defaults to the working dir and reports an empty one', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ls-')
  const out = String(await tool(createExtraTools(dir, {}), 'LS').fn({}))
  assert.equal(out, '(empty)')
})

test('LS skips node_modules and .git with a marker, and honours ignore', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ls-')
  await fs.mkdir(path.join(dir, 'node_modules'))
  await fs.mkdir(path.join(dir, '.git'))
  await fs.writeFile(path.join(dir, 'keep.txt'), 'k', 'utf-8')
  await fs.writeFile(path.join(dir, 'drop.log'), 'd', 'utf-8')
  const out = String(
    await tool(createExtraTools(dir, {}), 'LS').fn({ ignore: ' drop.log , ' }),
  )
  assert.deepEqual(out.split(NL), [
    '.git/ (skipped)',
    'keep.txt  (1 bytes)',
    'node_modules/ (skipped)',
  ])
})

test('LS refuses a missing directory, a file and a placeholder path', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ls-')
  const ls = tool(createExtraTools(dir, {}), 'LS')
  await fs.writeFile(path.join(dir, 'f.txt'), 'x', 'utf-8')
  await assert.rejects(async () => ls.fn({ path: 'nope' }), /No such directory/)
  await assert.rejects(async () => ls.fn({ path: 'f.txt' }), /Not a directory/)
  // A placeholder string is a MISSING argument, not a file name.
  await assert.rejects(
    async () => ls.fn({ path: 'undefined' }),
    /Invalid required argument path/,
  )
  await assert.rejects(
    async () => ls.fn({ path: 'null' }),
    /Invalid required argument/,
  )
  // An EMPTY string is falsy, so the tool treats it as "no path" and lists
  // the working directory instead of refusing. Pinned as-is.
  assert.equal(String(await ls.fn({ path: '' })), 'f.txt  (1 bytes)')
  await assert.rejects(
    async () => ls.fn({ path: { a: 1 } as never }),
    /expected a string, got/,
  )
})

test('MultiEdit refuses a missing new_string instead of deleting the text', async (t) => {
  const dir = await makeTmpDir(t, 'zames-me-')
  const file = path.join(dir, 'a.txt')
  await fs.writeFile(file, 'hello world', 'utf-8')
  const me = tool(createExtraTools(dir, {}), 'MultiEdit')
  await assert.rejects(
    async () => me.fn({ path: 'a.txt', edits: [{ old_string: 'world' }] }),
    /edits\[0\]: new_string is missing/,
  )
  // The file is untouched by the refused edit.
  assert.equal(await fs.readFile(file, 'utf-8'), 'hello world')
})

test('MultiEdit refuses an empty old_string, a missing match and an ambiguous one', async (t) => {
  const dir = await makeTmpDir(t, 'zames-me-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'x x', 'utf-8')
  const me = tool(createExtraTools(dir, {}), 'MultiEdit')
  await assert.rejects(
    async () =>
      me.fn({ path: 'a.txt', edits: [{ old_string: '', new_string: 'y' }] }),
    /old_string is empty/,
  )
  await assert.rejects(
    async () =>
      me.fn({ path: 'a.txt', edits: [{ old_string: 'zzz', new_string: 'y' }] }),
    /string not found/,
  )
  await assert.rejects(
    async () =>
      me.fn({ path: 'a.txt', edits: [{ old_string: 'x', new_string: 'y' }] }),
    /occurs 2 times/,
  )
  await assert.rejects(
    async () => me.fn({ path: 'a.txt', edits: 'not-an-array' as never }),
    /edits must be an array/,
  )
  await assert.rejects(
    async () => me.fn({ path: 'a.txt', edits: [] }),
    /edits is empty/,
  )
})

test('MultiEdit applies edits in order and keeps $-patterns literal', async (t) => {
  const dir = await makeTmpDir(t, 'zames-me-')
  const file = path.join(dir, 'a.txt')
  await fs.writeFile(file, 'one two two', 'utf-8')
  const me = tool(createExtraTools(dir, {}), 'MultiEdit')
  const out = String(
    await me.fn({
      path: 'a.txt',
      edits: [
        { old_string: 'one', new_string: '$& $1 $$' },
        { old_string: 'two', new_string: 'TWO', replace_all: true },
      ],
    }),
  )
  // A STRING replacer would expand $& / $1 / $$; the functional one does not.
  assert.equal(await fs.readFile(file, 'utf-8'), '$& $1 $$ TWO TWO')
  assert.equal(out, 'Edited (2 edits): a.txt')
})

test('MultiEdit accepts a base64 edits array', async (t) => {
  const dir = await makeTmpDir(t, 'zames-me-')
  const file = path.join(dir, 'a.txt')
  await fs.writeFile(file, 'abc', 'utf-8')
  const me = tool(createExtraTools(dir, {}), 'MultiEdit')
  const b64 = Buffer.from(
    JSON.stringify([{ old_string: 'b', new_string: 'B' }]),
  ).toString('base64')
  await me.fn({ path: 'a.txt', edits_base64: b64 })
  assert.equal(await fs.readFile(file, 'utf-8'), 'aBc')
})

test('MultiEdit refuses a missing path and a placeholder path', async (t) => {
  const dir = await makeTmpDir(t, 'zames-me-')
  const me = tool(createExtraTools(dir, {}), 'MultiEdit')
  await assert.rejects(
    async () => me.fn({ edits: [{ old_string: 'a', new_string: 'b' }] }),
    /Missing required argument: path/,
  )
  await assert.rejects(
    async () => me.fn({ path: 'undefined', edits: [] }),
    /Invalid required argument path/,
  )
})

test('TodoWrite stores the list it was given and renders it', async (t) => {
  const dir = await makeTmpDir(t, 'zames-td-')
  const store = createTodoStore()
  resetTodos(store)
  t.after(() => resetTodos(store))
  const todo = tool(createExtraTools(dir, { todos: store }), 'TodoWrite')
  const out = String(
    await todo.fn({
      todos: [
        { content: 'first', status: 'pending' },
        { content: 'second', status: 'completed' },
      ],
    }),
  )
  assert.equal(getTodos(store).length, 2)
  assert.equal(getTodos(store)[0].content, 'first')
  assert.ok(out.includes('first'), out)
})

test('TodoWrite refuses a non-array and honours base64', async (t) => {
  const dir = await makeTmpDir(t, 'zames-td-')
  const store = createTodoStore()
  resetTodos(store)
  t.after(() => resetTodos(store))
  const todo = tool(createExtraTools(dir, { todos: store }), 'TodoWrite')
  await assert.rejects(
    async () => todo.fn({ todos: 'nope' as never }),
    /todos must be an array/,
  )
  const b64 = Buffer.from(
    JSON.stringify([{ content: 'b64 item', status: 'in_progress' }]),
  ).toString('base64')
  await todo.fn({ todos_base64: b64 })
  assert.equal(getTodos(store)[0].content, 'b64 item')
})

test('ApplyPatch refuses an undecodable base64 body', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ap-')
  const ap = tool(createExtraTools(dir, {}), 'ApplyPatch')
  await assert.rejects(
    async () => ap.fn({ patch_base64: '!!!not base64!!!' }),
    /base64 argument is not valid/,
  )
})

test('ApplyPatch refuses Add File over an existing file', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ap-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'real content', 'utf-8')
  const ap = tool(createExtraTools(dir, {}), 'ApplyPatch')
  const body = [
    '*** Begin Patch',
    '*** Add File: a.txt',
    '+clobbered',
    '*** End Patch',
  ].join(NL)
  await assert.rejects(
    async () => ap.fn({ patch: body }),
    /the file already exists/,
  )
  assert.equal(
    await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'),
    'real content',
  )
})

test('ApplyPatch writes, updates and deletes in one call', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ap-')
  await fs.writeFile(path.join(dir, 'old.txt'), 'a' + NL + 'b' + NL, 'utf-8')
  const ap = tool(createExtraTools(dir, {}), 'ApplyPatch')
  const body = [
    '*** Begin Patch',
    '*** Add File: new.txt',
    '+hello',
    '*** Update File: old.txt',
    '@@',
    ' a',
    '-b',
    '+B',
    '*** Delete File: old.txt',
    '*** End Patch',
  ].join(NL)
  // Update and Delete on the SAME file in one patch: the staged writes run in
  // order, so the last one wins and the file is gone.
  const out = String(await ap.fn({ patch: body }))
  assert.equal(
    await fs.readFile(path.join(dir, 'new.txt'), 'utf-8'),
    'hello' + NL,
  )
  await assert.rejects(() => fs.stat(path.join(dir, 'old.txt')))
  assert.ok(out.startsWith('Patch applied:'), out)
  assert.ok(out.includes('written new.txt'), out)
  assert.ok(out.includes('deleted old.txt'), out)
})

test('ApplyPatch refuses an update of a missing file', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ap-')
  const ap = tool(createExtraTools(dir, {}), 'ApplyPatch')
  const body = [
    '*** Begin Patch',
    '*** Update File: gone.txt',
    '@@',
    '-a',
    '+b',
    '*** End Patch',
  ].join(NL)
  await assert.rejects(
    async () => ap.fn({ patch: body }),
    /no such file gone.txt/,
  )
})

test('ApplyPatch reports a parse error instead of applying half a patch', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ap-')
  const ap = tool(createExtraTools(dir, {}), 'ApplyPatch')
  await assert.rejects(
    async () => ap.fn({ patch: 'not a patch' }),
    /Begin Patch/,
  )
})
