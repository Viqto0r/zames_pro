import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createTools } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'
import { makeTmpDir } from './tmp-dir.ts'

const NL = String.fromCharCode(10)

function tmpDir(t: { after: (fn: () => unknown) => unknown }): Promise<string> {
  return makeTmpDir(t, 'zames-tools-')
}

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x['name'] === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

test('Read возвращает файл целиком', async (t) => {
  const dir = await tmpDir(t)
  const content = ['line1', 'line2', 'line3'].join(NL)
  await fs.writeFile(path.join(dir, 'a.txt'), content, 'utf-8')
  const tools = createTools(dir, {})
  const out = await tool(tools, 'Read').fn({ path: 'a.txt' })
  assert.equal(out, content)
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read с offset/limit возвращает только запрошенные строки', async (t) => {
  const dir = await tmpDir(t)
  await fs.writeFile(
    path.join(dir, 'a.txt'),
    ['l0', 'l1', 'l2', 'l3', 'l4'].join(NL),
    'utf-8',
  )
  const tools = createTools(dir, {})
  const out = await tool(tools, 'Read').fn({
    path: 'a.txt',
    // 1-based, like sed: line 2 onwards, two lines -> l1, l2.
    offset: 2,
    limit: 2,
  })
  assert.equal(out, ['l1', 'l2'].join(NL))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Write создаёт файл и родительские директории', async (t) => {
  const dir = await tmpDir(t)
  const tools = createTools(dir, {})
  await tool(tools, 'Write').fn({ path: 'sub/deep/b.txt', content: 'hello' })
  const data = await fs.readFile(path.join(dir, 'sub/deep/b.txt'), 'utf-8')
  assert.equal(data, 'hello')
  await fs.rm(dir, { recursive: true, force: true })
})

test('Edit заменяет единственное вхождение', async (t) => {
  const dir = await tmpDir(t)
  await fs.writeFile(path.join(dir, 'a.txt'), 'foo bar baz', 'utf-8')
  const tools = createTools(dir, {})
  await tool(tools, 'Edit').fn({
    path: 'a.txt',
    old_string: 'bar',
    new_string: 'QUX',
  })
  const data = await fs.readFile(path.join(dir, 'a.txt'), 'utf-8')
  assert.equal(data, 'foo QUX baz')
  await fs.rm(dir, { recursive: true, force: true })
})

test('Edit падает, если строка не найдена', async (t) => {
  const dir = await tmpDir(t)
  await fs.writeFile(path.join(dir, 'a.txt'), 'foo', 'utf-8')
  const tools = createTools(dir, {})
  await assert.rejects(async () =>
    tool(tools, 'Edit').fn({
      path: 'a.txt',
      old_string: 'nope',
      new_string: 'x',
    }),
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test('Edit падает при нескольких вхождениях (требует уникальности)', async (t) => {
  const dir = await tmpDir(t)
  await fs.writeFile(path.join(dir, 'a.txt'), 'a a a', 'utf-8')
  const tools = createTools(dir, {})
  await assert.rejects(async () =>
    tool(tools, 'Edit').fn({ path: 'a.txt', old_string: 'a', new_string: 'b' }),
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test('Edit с пустым old_string отвергается', async (t) => {
  const dir = await tmpDir(t)
  await fs.writeFile(path.join(dir, 'a.txt'), 'foo', 'utf-8')
  const tools = createTools(dir, {})
  await assert.rejects(async () =>
    tool(tools, 'Edit').fn({ path: 'a.txt', old_string: '', new_string: 'x' }),
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test('инструменты не читают выше рабочей директории (sandbox)', async (t) => {
  const dir = await tmpDir(t)
  const tools = createTools(dir, {})
  await assert.rejects(async () =>
    tool(tools, 'Read').fn({ path: '../../../etc/passwd' }),
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test('Glob находит файлы по паттерну и не выходит за sandbox', async (t) => {
  const dir = await tmpDir(t)
  await fs.writeFile(path.join(dir, 'x.ts'), '1', 'utf-8')
  await fs.writeFile(path.join(dir, 'y.js'), '2', 'utf-8')
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Glob').fn({ pattern: '*.ts' }))
  assert.ok(out.includes('x.ts'))
  assert.ok(!out.includes('y.js'))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Bash выполняет команду в рабочей директории и возвращает вывод', async (t) => {
  const dir = await tmpDir(t)
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Bash').fn({ command: 'echo hello' }))
  assert.ok(out.includes('hello'))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Bash сообщает exit code при ошибке', async (t) => {
  const dir = await tmpDir(t)
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Bash').fn({ command: 'exit 3' }))
  assert.ok(/Exit code: 3/.test(out), out)
  await fs.rm(dir, { recursive: true, force: true })
})

test('Bash блокирует cd выше рабочей директории', async (t) => {
  const dir = await tmpDir(t)
  const tools = createTools(dir, {})
  await assert.rejects(async () =>
    tool(tools, 'Bash').fn({ command: 'cd ../../.. && pwd' }),
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test('Write делает backup перед перезаписью (undo)', async (t) => {
  const dir = await tmpDir(t)
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

test('Read на картинке возвращает маркер, а не utf-8 мусор (N35)', async (t) => {
  const dir = await tmpDir(t)
  // A minimal valid PNG header; content is binary, not decodable text.
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ])
  await fs.writeFile(path.join(dir, 'pic.png'), png)
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Read').fn({ path: 'pic.png' }))
  assert.ok(out.startsWith('[image: pic.png]'), out)
  assert.ok(out.includes('image/png'), out)
  assert.ok(out.includes('paste'), out)
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read на произвольном бинарнике даёт hex-заголовок, а не мусор (N35)', async (t) => {
  const dir = await tmpDir(t)
  await fs.writeFile(
    path.join(dir, 'blob.bin'),
    Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]),
  )
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Read').fn({ path: 'blob.bin' }))
  assert.ok(out.includes('binary file'), out)
  assert.ok(out.includes('000102fffe'), out)
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read обычного текста не задет бинарной защитой (N35)', async (t) => {
  const dir = await tmpDir(t)
  await fs.writeFile(path.join(dir, 't.txt'), 'hello world', 'utf-8')
  const tools = createTools(dir, {})
  const out = await tool(tools, 'Read').fn({ path: 't.txt' })
  assert.equal(out, 'hello world')
  await fs.rm(dir, { recursive: true, force: true })
})

// Read clips a very long line at 2000 UTF-16 units. If an emoji / astral CJK
// char sits on that boundary the clip kept its HIGH half and dropped the low
// one, handing the model a lone surrogate. Same rule as truncateToolResult.
test('Read does not cut a surrogate pair when clipping a long line', async (t) => {
  const dir = await makeTmpDir(t, 'zames-rclip-')
  // The HIGH half of the pair must land on the 2000-unit clip boundary:
  // 1999 ASCII chars, then the two halves of U+1F600.
  const emoji = String.fromCharCode(0xd83d, 0xde00)
  await fs.writeFile(
    path.join(dir, 'l.txt'),
    'a'.repeat(1999) + emoji + 'b'.repeat(50),
    'utf-8',
  )
  const tools = createTools(dir, {})
  const out = String(await tool(tools, 'Read').fn({ path: 'l.txt' }))
  assert.ok(out.includes('line truncated'), 'the line must be clipped')
  const marker = out.indexOf(' \u2026[line truncated]')
  assert.ok(marker > 0, 'marker must be present')
  const beforeMarker = out.charCodeAt(marker - 1)
  assert.ok(
    !(beforeMarker >= 0xd800 && beforeMarker <= 0xdbff),
    'the kept text ends with a lone high surrogate: ' +
      beforeMarker.toString(16),
  )
  for (let i = 0; i < out.length; i++) {
    const c = out.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = out.charCodeAt(i + 1)
      assert.ok(
        n >= 0xdc00 && n <= 0xdfff,
        'Read left a lone high surrogate at the clip boundary',
      )
    }
  }
  await fs.rm(dir, { recursive: true, force: true })
})
