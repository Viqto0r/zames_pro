import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { createTools } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'
import { makeTmpDir } from './tmp-dir.ts'

// Edit with `old_string` but NO `new_string` (the model omitted it, e.g. a
// truncated call) used to DELETE the matched text: `String(undefined)` is ''.
// The tool reported success while silently erasing code. A missing new_string
// must be rejected; an EXPLICIT empty string is a legitimate delete.
function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

test('Edit without new_string does not delete the text', async (t) => {
  const dir = await makeTmpDir(t, 'zames-edit-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'foo bar')
  const tools = createTools(dir)
  await assert.rejects(
    () =>
      Promise.resolve(
        tool(tools, 'Edit').fn({ path: 'a.txt', old_string: 'foo' }),
      ),
    /new_string/i,
  )
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'), 'foo bar')
})

test('Edit with an explicit empty new_string still deletes', async (t) => {
  const dir = await makeTmpDir(t, 'zames-edit-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'foo bar')
  const tools = createTools(dir)
  await tool(tools, 'Edit').fn({
    path: 'a.txt',
    old_string: 'foo ',
    new_string: '',
  })
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'), 'bar')
})
