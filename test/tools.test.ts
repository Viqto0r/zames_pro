import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createTools } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'

const NL = String.fromCharCode(10)

function tmpDir(): string {
  return fs.mkdtemp(path.join(os.tmpdir(), 'zames-tools-'))
}

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x['name'] === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

test('Read возвращает файл целиком', async () => {
  const dir = await tmpDir()
  const content = ['line1', 'line2', 'line3'].join(NL)
  await fs.writeFile(path.join(dir, 'a.txt'), content, 'utf-8')
  const tools = createTools(dir, {})
  const out = await tool(tools, 'Read').fn({ path: 'a.txt' })
  assert.equal(out, content)
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read с offset/limit возвращает только запрошенные строки', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), ['l0', 'l1', 'l2', 'l3', 'l4'].join(NL), 'utf-8')
  const tools = createTools(dir, {})
  const out = await tool(tools, 'Read').fn({ path: 'a.txt', offset: 1, limit: 2 })
  assert.equal(out, ['l1', 'l2'].join(NL))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Write создаёт файл и родительские директории', async () => {
  const dir = await tmpDir()
  const tools = createTools(dir, {})
  await tool(tools, 'Write').fn({ path: 'sub/deep/b.txt', content: 'hello' })
  const data = await fs.readFile(path.join(dir, 'sub/deep/b.txt'), 'utf-8')
  assert.equal(data, 'hello')
  await fs.rm(dir, { recursive: true, force: true })
})

test('Edit заменяет единственное вхождение', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), 'foo bar baz', 'utf-8')
  const tools = createTools(dir, {})
  await tool(tools, 'Edit').fn({ path: 'a.txt', old_string: 'bar', new_string: 'QUX' })
  const data = await fs.readFile(path.join(dir, 'a.txt'), 'utf-8')
  assert.equal(data, 'foo QUX baz')
  await fs.rm(dir, { recursive: true, force: true })
})

test('Edit падает, если строка не найдена', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), 'foo', 'utf-8')
  const tools = createTools(dir, {})
  await assert.rejects(() =>
    tool(tools, 'Edit').fn({ path: 'a.txt', old_string: 'nope', new_string: 'x' }),
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test('Edit падает при нескольких вхождениях (требует уникальности)', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), 'a a a', 'utf-8')
  const tools = createTools(dir, {})
  await assert.rejects(() =>
    tool(tools, 'Edit').fn({ path: 'a.txt', old_string: 'a', new_string: 'b' }),
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test('Edit с пустым old_string отвергается', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'a.txt'), 'foo', 'utf-8')
  const tools = createTools(dir, {})
  await assert.rejects(() =>
    tool(tools, 'Edit').fn({ path: 'a.txt', old_string: '', new_string: 'x' }),
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test('инструменты не читают выше рабочей директории (sandbox)', async () => {
  const dir = await tmpDir()
  const tools = createTools(dir, {})
  await assert.rejects(() => tool(tools, 'Read').fn({ path: '../../../etc/passwd' }))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Glob находит файлы по паттерну и не выходит за sandbox', async () => {
  const dir = await tmpDir()
  await fs.writeFile(path.join(dir, 'x.ts'), '1', 'utf-8')
  await fs.writeFile(path.join(dir, 'y.js'), '2', 'utf-8')
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Glob').fn({ pattern: '*.ts' }))
  assert.ok(out.includes('x.ts'))
  assert.ok(!out.includes('y.js'))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Bash выполняет команду в рабочей директории и возвращает вывод', async () => {
  const dir = await tmpDir()
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Bash').fn({ command: 'echo hello' }))
  assert.ok(out.includes('hello'))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Bash сообщает exit code при ошибке', async () => {
  const dir = await tmpDir()
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Bash').fn({ command: 'exit 3' }))
  assert.ok(/Exit code: 3/.test(out), out)
  await fs.rm(dir, { recursive: true, force: true })
})

test('Bash блокирует cd выше рабочей директории', async () => {
  const dir = await tmpDir()
  const tools = createTools(dir, {})
  await assert.rejects(() => tool(tools, 'Bash').fn({ command: 'cd ../../.. && pwd' }))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Write делает backup перед перезаписью (undo)', async () => {
  const dir = await tmpDir()
  const backups: string[] = []
  const fakeUndo = {
    async backup(p: string) {
      backups.push(p)
      return { originalPath: p, existed: true, stamp: 1 }
    },
  }
  const tools = createTools(dir, { undo: fakeUndo as never })
  await tool(tools, 'Write').fn({ path: 'a.txt', content: 'new' })
  assert.equal(backups.length, 1)
  assert.ok(backups[0].endsWith('a.txt'))
  await fs.rm(dir, { recursive: true, force: true })
})
