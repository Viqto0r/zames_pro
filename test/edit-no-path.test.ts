import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createTools } from '../src/tools.ts'
import { createExtraTools } from '../src/extraTools.ts'
import type { ToolDef } from '../src/types.ts'

// A model call may OMIT a required string arg (or send a placeholder). The
// required-argument guard (`req()`) exists exactly for that: without it a
// missing `path` becomes the literal string "undefined", which
// `path.resolve(root, 'undefined')` happily turns into a real file in the
// working directory — Write CREATED a file named `undefined` that way (the
// `undefined` entry in .gitignore is the scar). The Edit/MultiEdit handlers
// reach for `fs.readFile` BEFORE the guard, so the same sloppy call throws a
// raw ENOENT (a confusing "no such file .../undefined" instead of the
// actionable `Missing required argument: path`), and an agent retrying the
// call without fixing the argument loops on that noise.

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'zames-req-'))
}

const MISSING = /Missing required argument: path/

test('Edit without a path reports the missing argument, not ENOENT', async () => {
  const dir = await tmpDir()
  const tools = createTools(dir)
  await assert.rejects(
    () => tool(tools, 'Edit').fn({ old_string: 'a', new_string: 'b' }) as never,
    MISSING,
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test('MultiEdit without a path reports the missing argument, not ENOENT', async () => {
  const dir = await tmpDir()
  const tools = createExtraTools(dir, {})
  await assert.rejects(
    () =>
      tool(tools, 'MultiEdit').fn({
        edits: [{ old_string: 'a', new_string: 'b' }],
      }) as never,
    MISSING,
  )
  await fs.rm(dir, { recursive: true, force: true })
})

test('a placeholder path ("undefined") is rejected too', async () => {
  const dir = await tmpDir()
  const tools = createTools(dir)
  await assert.rejects(
    () =>
      tool(tools, 'Edit').fn({
        path: 'undefined',
        old_string: 'a',
        new_string: 'b',
      }) as never,
    /Invalid required argument path/,
  )
  const left = await fs.readdir(dir)
  assert.deepEqual(left, [])
  await fs.rm(dir, { recursive: true, force: true })
})
