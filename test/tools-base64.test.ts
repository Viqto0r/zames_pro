import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createTools } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x['name'] === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

function b64(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64')
}

test('Write: content_base64 записывает точный текст со спецсимволами', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-b64-'))
  const D = String.fromCharCode(36)
  const BS = String.fromCharCode(92)
  const NL = String.fromCharCode(10)
  const content = 'const s = ' + D + '{x}' + BS + 'n' + NL + 'line2'
  const tools = createTools(dir, {})
  await tool(tools, 'Write').fn({ path: 'a.js', content_base64: b64(content) })
  const got = await fs.readFile(path.join(dir, 'a.js'), 'utf-8')
  assert.equal(got, content)
  await fs.rm(dir, { recursive: true, force: true })
})

test('Write: content_base64 имеет приоритет над content', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-b64-'))
  const tools = createTools(dir, {})
  await tool(tools, 'Write').fn({
    path: 'a.txt',
    content: 'wrong',
    content_base64: b64('right'),
  })
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'), 'right')
  await fs.rm(dir, { recursive: true, force: true })
})

test('Edit: old_base64/new_base64 заменяют точный текст со спецсимволами', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-b64-'))
  const D = String.fromCharCode(36)
  const old = 'value = ' + D + '{a}'
  const next = 'value = ' + D + '{b}'
  await fs.writeFile(path.join(dir, 'a.js'), 'const ' + old, 'utf-8')
  const tools = createTools(dir, {})
  await tool(tools, 'Edit').fn({
    path: 'a.js',
    old_base64: b64(old),
    new_base64: b64(next),
  })
  const got = await fs.readFile(path.join(dir, 'a.js'), 'utf-8')
  assert.equal(got, 'const ' + next)
  await fs.rm(dir, { recursive: true, force: true })
})

test('Edit: многострочный old_base64 находится (переводы строк точные)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-b64-'))
  const NL = String.fromCharCode(10)
  const old = ['a', 'b', 'c'].join(NL)
  await fs.writeFile(path.join(dir, 'f.txt'), old, 'utf-8')
  const tools = createTools(dir, {})
  await tool(tools, 'Edit').fn({
    path: 'f.txt',
    old_base64: b64('b'),
    new_base64: b64('B'),
  })
  assert.equal(
    await fs.readFile(path.join(dir, 'f.txt'), 'utf-8'),
    ['a', 'B', 'c'].join(NL),
  )
  await fs.rm(dir, { recursive: true, force: true })
})
