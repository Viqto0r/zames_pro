import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { createTools } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'
import { makeTmpDir } from './tmp-dir.ts'

// An offset PAST the end of the file used to return an EMPTY string, which the
// model reads as "the file is empty" (or as a broken tool) instead of "you
// asked for a window that does not exist". The numbered branch already
// produced an empty result too. A model that mis-estimated the offset then
// re-read the file from the start, or concluded the file had no content.
function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

test('Read past EOF says so instead of returning an empty string', async (t) => {
  const dir = await makeTmpDir(t, 'zames-read-eof-')
  await fs.writeFile(path.join(dir, 'f.txt'), 'l1\nl2\nl3', 'utf-8')
  const tools = createTools(dir)
  const out = String(
    await tool(tools, 'Read').fn({ path: 'f.txt', offset: 99 }),
  )
  assert.notEqual(out, '', 'an empty string reads as "file is empty"')
  assert.match(out, /99/)
  assert.match(out, /3 lines?/i)
})

test('a window that DOES exist is unchanged', async (t) => {
  const dir = await makeTmpDir(t, 'zames-read-eof-')
  await fs.writeFile(path.join(dir, 'f.txt'), 'l1\nl2\nl3', 'utf-8')
  const tools = createTools(dir)
  const out = String(
    await tool(tools, 'Read').fn({ path: 'f.txt', offset: 2, limit: 99 }),
  )
  assert.equal(out, 'l2\nl3')
})
