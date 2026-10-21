import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { createTools } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'
import { makeTmpDir } from './tmp-dir.ts'

// Write with NEITHER `content` NOR `content_base64` (the model omitted both,
// e.g. a truncated call) used to write an EMPTY string: an existing file was
// silently truncated to zero bytes and the tool reported success. A missing
// content must be rejected like a missing path.
function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

test('Write without content does not truncate an existing file', async (t) => {
  const dir = await makeTmpDir(t, 'zames-write-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'important')
  const tools = createTools(dir)
  await assert.rejects(
    () => Promise.resolve(tool(tools, 'Write').fn({ path: 'a.txt' })),
    /content/i,
  )
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'), 'important')
})

test('Write with an EMPTY string content still creates an empty file', async (t) => {
  const dir = await makeTmpDir(t, 'zames-write-')
  const tools = createTools(dir)
  const r = await tool(tools, 'Write').fn({ path: 'e.txt', content: '' })
  assert.match(String(r), /File written/)
  assert.equal(await fs.readFile(path.join(dir, 'e.txt'), 'utf-8'), '')
})

test('Write with content_base64 works as before', async (t) => {
  const dir = await makeTmpDir(t, 'zames-write-')
  const tools = createTools(dir)
  const b64 = Buffer.from('hi $x').toString('base64')
  await tool(tools, 'Write').fn({ path: 'b.txt', content_base64: b64 })
  assert.equal(await fs.readFile(path.join(dir, 'b.txt'), 'utf-8'), 'hi $x')
})
