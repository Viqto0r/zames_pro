import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { createExtraTools } from '../src/extraTools.ts'
import type { ToolDef } from '../src/types.ts'
import { makeTmpDir } from './tmp-dir.ts'

// `*** Add File:` means CREATE. Applied to an EXISTING file it silently
// OVERWROTE the whole file (the add writer just writes the body), so a stale
// or wrong path destroyed real content with no warning. Creating a file that
// already exists must fail; the update/delete ops remain for existing files.
function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

test('ApplyPatch Add File refuses to overwrite an existing file', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ap-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'keep me')
  const tools = createExtraTools(dir)
  const patch = '*** Begin Patch\n*** Add File: a.txt\n+new\n*** End Patch'
  await assert.rejects(
    () => Promise.resolve(tool(tools, 'ApplyPatch').fn({ patch })),
    /exist/i,
  )
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'), 'keep me')
})

test('ApplyPatch Add File still creates a NEW file', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ap-')
  const tools = createExtraTools(dir)
  const patch = '*** Begin Patch\n*** Add File: n.txt\n+hello\n*** End Patch'
  await tool(tools, 'ApplyPatch').fn({ patch })
  assert.equal(await fs.readFile(path.join(dir, 'n.txt'), 'utf-8'), 'hello\n')
})
