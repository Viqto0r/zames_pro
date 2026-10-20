import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createTools } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'
import { makeTmpDir } from './tmp-dir.ts'

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x['name'] === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

function b64(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64')
}

test('Write: content_base64 записывает точный текст со спецсимволами', async (t) => {
  const dir = await makeTmpDir(t, 'zames-b64-')
  const D = String.fromCharCode(36)
  const BS = String.fromCharCode(92)
  const NL = String.fromCharCode(10)
  const content = 'const s = ' + D + '{x}' + BS + 'n' + NL + 'line2'
  const tools = createTools(dir, {})
  await tool(tools, 'Write').fn({ path: 'a.js', content_base64: b64(content) })
  const got = await fs.readFile(path.join(dir, 'a.js'), 'utf-8')
  assert.equal(got, content)
})

test('Write: content_base64 имеет приоритет над content', async (t) => {
  const dir = await makeTmpDir(t, 'zames-b64-')
  const tools = createTools(dir, {})
  await tool(tools, 'Write').fn({
    path: 'a.txt',
    content: 'wrong',
    content_base64: b64('right'),
  })
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'), 'right')
})

test('Edit: old_base64/new_base64 заменяют точный текст со спецсимволами', async (t) => {
  const dir = await makeTmpDir(t, 'zames-b64-')
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
})

test('Edit: многострочный old_base64 находится (переводы строк точные)', async (t) => {
  const dir = await makeTmpDir(t, 'zames-b64-')
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
})

// A corrupted/garbled base64 string used to be accepted SILENTLY:
// Buffer.from(x, 'base64') drops invalid characters and returns garbage, so a
// bad payload wrote a corrupt file with no error. It must be rejected.
test('Write: invalid content_base64 is rejected, not silently corrupted', async (t) => {
  const dir = await makeTmpDir(t, 'zames-b64-')
  const tools = createTools(dir, {})
  await assert.rejects(
    async () =>
      tool(tools, 'Write').fn({
        path: 'a.txt',
        content_base64: '!!!not base64!!!',
      }),
    /not valid base64/,
  )
  // The file must NOT have been created with garbage content.
  await assert.rejects(async () =>
    fs.readFile(path.join(dir, 'a.txt'), 'utf-8'),
  )
})

test('Write: valid content_base64 with newlines is accepted', async (t) => {
  const dir = await makeTmpDir(t, 'zames-b64-')
  const tools = createTools(dir, {})
  const NL = String.fromCharCode(10)
  // Wrap the base64 in newlines (some channels do this); it must still decode.
  const wrapped = b64('hello world')
    .replace(/(.{4})/g, '$1' + NL)
    .trim()
  await tool(tools, 'Write').fn({ path: 'a.txt', content_base64: wrapped })
  assert.equal(
    await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'),
    'hello world',
  )
})
