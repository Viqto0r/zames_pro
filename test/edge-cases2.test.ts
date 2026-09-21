import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createTools } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'

const NL = String.fromCharCode(10)

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x['name'] === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

test('Edit корректно заменяет многострочный фрагмент', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-ml-'))
  const orig = ['a', 'b', 'c', 'd'].join(NL)
  await fs.writeFile(path.join(dir, 'f.txt'), orig, 'utf-8')
  const tools = createTools(dir, {})
  const oldStr = ['b', 'c'].join(NL)
  const newStr = ['B', 'C', 'X'].join(NL)
  await tool(tools, 'Edit').fn({ path: 'f.txt', old_string: oldStr, new_string: newStr })
  const after = await fs.readFile(path.join(dir, 'f.txt'), 'utf-8')
  assert.equal(after, ['a', 'B', 'C', 'X', 'd'].join(NL))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read с offset за пределами файла возвращает пустую строку, не падает', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-off-'))
  await fs.writeFile(path.join(dir, 'f.txt'), 'a' + NL + 'b', 'utf-8')
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Read').fn({ path: 'f.txt', offset: 100, limit: 5 }))
  assert.equal(out, '')
  await fs.rm(dir, { recursive: true, force: true })
})

test('Glob не возвращает файлы выше рабочей директории', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-glob-'))
  const sub = path.join(dir, 'sub')
  await fs.mkdir(sub, { recursive: true })
  await fs.writeFile(path.join(dir, 'top.txt'), 'x', 'utf-8')
  await fs.writeFile(path.join(sub, 'in.txt'), 'y', 'utf-8')
  const tools = createTools(sub, {})
  // паттерн, пытающийся выйти на уровень выше
  const out = String(await tool(tools, 'Glob').fn({ pattern: '../*.txt' }))
  assert.ok(!out.includes('top.txt'), 'не должен показывать файлы выше root: ' + out)
  await fs.rm(dir, { recursive: true, force: true })
})
