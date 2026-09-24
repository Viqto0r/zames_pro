import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createExtraTools, parsePatch, applyUpdateHunk, renderTodos, normalizeTodos, getTodos, resetTodos } from '../src/extraTools.ts'
import { createTools } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'

const NL = String.fromCharCode(10)

function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'zames-extra-'))
}

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

// ---------- LS ----------

test('LS перечисляет файлы и директории, помечая папки', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), 'hello', 'utf-8')
  await fs.mkdir(path.join(dir, 'sub'))
  const tools = createExtraTools(dir, {})
  const out = String(await tool(tools, 'LS').fn({}))
  assert.ok(out.includes('a.txt'), out)
  assert.ok(out.includes('sub/'), out)
  await fs.rm(dir, { recursive: true, force: true })
})

test('LS пропускает ignore-имена', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'keep.txt'), 'x', 'utf-8')
  await fs.writeFile(path.join(dir, 'skip.log'), 'x', 'utf-8')
  const tools = createExtraTools(dir, {})
  const out = String(await tool(tools, 'LS').fn({ ignore: 'skip.log' }))
  assert.ok(out.includes('keep.txt'), out)
  assert.ok(!out.includes('skip.log'), out)
  await fs.rm(dir, { recursive: true, force: true })
})

test('LS не выходит за sandbox', async () => {
  const dir = await tmpDir()
  const tools = createExtraTools(dir, {})
  await assert.rejects(async () => tool(tools, 'LS').fn({ path: '../../..' }))
  await fs.rm(dir, { recursive: true, force: true })
})

// ---------- MultiEdit ----------

test('MultiEdit применяет несколько правок последовательно', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), 'one two three', 'utf-8')
  const tools = createExtraTools(dir, {})
  await tool(tools, 'MultiEdit').fn({
    path: 'a.txt',
    edits: [
      { old_string: 'one', new_string: '1' },
      { old_string: 'three', new_string: '3' },
    ],
  })
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'), '1 two 3')
  await fs.rm(dir, { recursive: true, force: true })
})

test('MultiEdit атомарен: при ошибке файл не меняется', async () => {
  const dir = await tmpDir()
  const orig = 'alpha beta'
  await fs.writeFile(path.join(dir, 'a.txt'), orig, 'utf-8')
  const tools = createExtraTools(dir, {})
  await assert.rejects(async () =>
    tool(tools, 'MultiEdit').fn({
      path: 'a.txt',
      edits: [
        { old_string: 'alpha', new_string: 'A' },
        { old_string: 'nope', new_string: 'X' },
      ],
    }),
  )
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'), orig)
  await fs.rm(dir, { recursive: true, force: true })
})

test('MultiEdit: replace_all заменяет все вхождения', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), 'x x x', 'utf-8')
  const tools = createExtraTools(dir, {})
  await tool(tools, 'MultiEdit').fn({
    path: 'a.txt',
    edits: [{ old_string: 'x', new_string: 'y', replace_all: true }],
  })
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'), 'y y y')
  await fs.rm(dir, { recursive: true, force: true })
})

// ---------- TodoWrite ----------

test('TodoWrite сохраняет и рендерит список', async () => {
  resetTodos()
  const dir = await tmpDir()
  const tools = createExtraTools(dir, {})
  const out = String(
    await tool(tools, 'TodoWrite').fn({
      todos: [
        { content: 'step 1', status: 'completed' },
        { content: 'step 2', status: 'in_progress' },
        { content: 'step 3', status: 'pending' },
      ],
    }),
  )
  assert.ok(out.includes('[x] step 1'), out)
  assert.ok(out.includes('[~] step 2'), out)
  assert.ok(out.includes('[ ] step 3'), out)
  assert.equal(getTodos().length, 3)
  await fs.rm(dir, { recursive: true, force: true })
})

test('TodoWrite заменяет список целиком', async () => {
  resetTodos()
  const dir = await tmpDir()
  const tools = createExtraTools(dir, {})
  await tool(tools, 'TodoWrite').fn({ todos: [{ content: 'a', status: 'pending' }] })
  await tool(tools, 'TodoWrite').fn({ todos: [{ content: 'b', status: 'completed' }] })
  const list = getTodos()
  assert.equal(list.length, 1)
  assert.equal(list[0].content, 'b')
  await fs.rm(dir, { recursive: true, force: true })
})

test('normalizeTodos отбрасывает пустые и нормализует статусы', () => {
  const items = normalizeTodos([
    { content: '  ', status: 'pending' },
    { text: 'real', status: 'done' },
    { content: 'act', status: 'active' },
    { content: 'x', status: 'weird' },
  ])
  assert.equal(items.length, 3)
  assert.equal(items[0].status, 'completed')
  assert.equal(items[1].status, 'in_progress')
  assert.equal(items[2].status, 'pending')
})

test('renderTodos на пустом списке не пустая строка', () => {
  assert.ok(renderTodos([]).length > 0)
})

// ---------- parsePatch / applyUpdateHunk ----------

test('parsePatch разбирает add/update/delete', () => {
  const patch = [
    '*** Begin Patch',
    '*** Add File: new.txt',
    '+hello',
    '*** Update File: old.txt',
    ' keep',
    '-old',
    '+new',
    '*** Delete File: gone.txt',
    '*** End Patch',
  ].join(NL)
  const { ops, error } = parsePatch(patch)
  assert.equal(error, undefined)
  assert.equal(ops.length, 3)
  assert.equal(ops[0].op, 'add')
  assert.equal(ops[1].op, 'update')
  assert.equal(ops[2].op, 'delete')
})

test('parsePatch требует Begin/End', () => {
  assert.ok(parsePatch('*** Add File: x').error)
  assert.ok(parsePatch('*** Begin Patch' + NL + '*** Add File: x').error)
})

test('parsePatch отклоняет абсолютные пути и ..', () => {
  const abs = ['*** Begin Patch', '*** Add File: /etc/passwd', '*** End Patch'].join(NL)
  assert.ok(parsePatch(abs).error)
  const dotdot = ['*** Begin Patch', '*** Add File: ../evil', '*** End Patch'].join(NL)
  assert.ok(parsePatch(dotdot).error)
})

test('applyUpdateHunk заменяет по контексту', () => {
  const content = ['a', 'b', 'c', 'd'].join(NL)
  const hunk = [' b', '-c', '+C'].join(NL).split(NL)
  const res = applyUpdateHunk(content, hunk)
  assert.equal(res.ok, true)
  assert.equal(res.content, ['a', 'b', 'C', 'd'].join(NL))
})

test('applyUpdateHunk сообщает, если контекст не найден', () => {
  const res = applyUpdateHunk('a' + NL + 'b', [' zzz', '-q', '+Q'])
  assert.equal(res.ok, false)
  assert.ok(res.error)
})

// ---------- ApplyPatch end-to-end ----------

test('ApplyPatch создаёт, правит и удаляет файлы', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'old.txt'), 'keep' + NL + 'old' + NL + 'tail', 'utf-8')
  await fs.writeFile(path.join(dir, 'gone.txt'), 'bye', 'utf-8')
  const tools = createExtraTools(dir, {})
  const patch = [
    '*** Begin Patch',
    '*** Add File: sub/new.txt',
    '+fresh',
    '*** Update File: old.txt',
    ' keep',
    '-old',
    '+new',
    ' tail',
    '*** Delete File: gone.txt',
    '*** End Patch',
  ].join(NL)
  await tool(tools, 'ApplyPatch').fn({ patch })
  assert.equal(await fs.readFile(path.join(dir, 'sub/new.txt'), 'utf-8'), 'fresh' + NL)
  assert.equal(
    await fs.readFile(path.join(dir, 'old.txt'), 'utf-8'),
    'keep' + NL + 'new' + NL + 'tail',
  )
  await assert.rejects(async () => fs.stat(path.join(dir, 'gone.txt')))
  await fs.rm(dir, { recursive: true, force: true })
})

test('ApplyPatch не пишет ни одного файла при ошибке в патче', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), 'x', 'utf-8')
  const tools = createExtraTools(dir, {})
  const patch = [
    '*** Begin Patch',
    '*** Add File: b.txt',
    '+new',
    '*** Update File: a.txt',
    ' nope-context',
    '-y',
    '+z',
    '*** End Patch',
  ].join(NL)
  await assert.rejects(async () => tool(tools, 'ApplyPatch').fn({ patch }))
  // b.txt must not exist: staging happens before any write.
  await assert.rejects(async () => fs.stat(path.join(dir, 'b.txt')))
  await fs.rm(dir, { recursive: true, force: true })
})

// ---------- wiring ----------

test('createTools включает новые инструменты', () => {
  const tools = createTools(process.cwd(), {})
  for (const name of ['LS', 'MultiEdit', 'TodoWrite', 'ApplyPatch']) {
    assert.ok(tool(tools, name), 'missing ' + name)
  }
})

// ---------- Read: numbered / clipping / empty ----------

test('Read по умолчанию возвращает сырой контент (контракт Edit)', async () => {
  const dir = await tmpDir()
  const body = ['alpha', 'beta', 'gamma'].join(NL)
  await fs.writeFile(path.join(dir, 'a.txt'), body, 'utf-8')
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Read').fn({ path: 'a.txt' }))
  assert.equal(out, body)
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read numbered=true добавляет номера строк cat -n', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), ['x', 'y'].join(NL), 'utf-8')
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Read').fn({ path: 'a.txt', numbered: true }))
  const lines = out.split(NL)
  assert.equal(lines[0], '1\tx')
  assert.equal(lines[1], '2\ty')
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read numbered с offset нумерует от реальной строки', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), ['l0', 'l1', 'l2', 'l3'].join(NL), 'utf-8')
  const tools = createTools(dir, {})
  const out = String(
    await tool(tools, 'Read').fn({ path: 'a.txt', offset: 2, limit: 2, numbered: true }),
  )
  assert.equal(out, '3\tl2' + NL + '4\tl3')
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read обрезает очень длинные строки', async () => {
  const dir = await tmpDir()
  const long = 'a'.repeat(5000)
  await fs.writeFile(path.join(dir, 'big.txt'), long, 'utf-8')
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Read').fn({ path: 'big.txt' }))
  assert.ok(out.length < 5000, 'строка должна быть обрезана')
  assert.ok(out.includes('truncated'), out.slice(0, 80))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read пустого файла возвращает пояснение, не пустую строку', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'empty.txt'), '', 'utf-8')
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Read').fn({ path: 'empty.txt' }))
  assert.ok(out.length > 0)
  assert.ok(/empty/i.test(out), out)
  await fs.rm(dir, { recursive: true, force: true })
})

// Numbered output must NOT be fed back into Edit as-is; verify the raw
// (non-numbered) output is what Edit expects.
test('Read сырой вывод подходит для Edit old_string', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), 'foo bar baz', 'utf-8')
  const tools = createTools(dir, {})
  const raw = String(await tool(tools, 'Read').fn({ path: 'a.txt' }))
  assert.equal(raw, 'foo bar baz')
  await tool(tools, 'Edit').fn({ path: 'a.txt', old_string: 'bar', new_string: 'QUX' })
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'), 'foo QUX baz')
  await fs.rm(dir, { recursive: true, force: true })
})
