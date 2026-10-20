import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createGitTools, NO_OUTPUT_SENTINEL } from '../src/gitTools.ts'
import type { ToolDef } from '../src/types.ts'

const run = promisify(execFile)

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

async function repo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-git-'))
  await run('git', ['init', '-q'], { cwd: dir })
  await run('git', ['config', 'user.email', 'a@b.c'], { cwd: dir })
  await run('git', ['config', 'user.name', 't'], { cwd: dir })
  return dir
}

// The parameter is declared `paths: 'string?'`, so the MODEL sends a STRING
// (e.g. the output of a glob, or a space-separated list). The handler passed
// the whole string as ONE pathspec: `GitAdd` with "a.txt b.txt" answered
// `fatal: pathspec 'a.txt b.txt' did not match any files` and nothing was
// staged. GitStatus advertised the parameters as a string, so this is the
// documented shape, not a malformed call.
test('GitAdd stages several space-separated paths', async () => {
  const dir = await repo()
  await fs.writeFile(path.join(dir, 'a.txt'), 'a', 'utf-8')
  await fs.writeFile(path.join(dir, 'b.txt'), 'b', 'utf-8')
  const tools = createGitTools(dir)
  const out = await tool(tools, 'GitAdd').fn({ paths: 'a.txt b.txt' })
  assert.ok(
    !String(out).includes('did not match'),
    'space-separated paths must be split: ' + String(out),
  )
  const staged = await run('git', ['diff', '--cached', '--name-only'], {
    cwd: dir,
  })
  const names = staged.stdout.trim().split(String.fromCharCode(10)).sort()
  assert.deepEqual(names, ['a.txt', 'b.txt'])
  await fs.rm(dir, { recursive: true, force: true })
})

// A single path with a SPACE in its name must still work (quoting).
test('GitAdd stages one quoted path containing a space', async () => {
  const dir = await repo()
  await fs.writeFile(path.join(dir, 'my file.txt'), 'a', 'utf-8')
  const tools = createGitTools(dir)
  const out = await tool(tools, 'GitAdd').fn({ paths: '"my file.txt"' })
  assert.ok(
    !String(out).includes('did not match'),
    'quoted path must be staged: ' + String(out),
  )
  const staged = await run('git', ['diff', '--cached', '--name-only'], {
    cwd: dir,
  })
  assert.equal(staged.stdout.trim(), 'my file.txt')
  await fs.rm(dir, { recursive: true, force: true })
})

// An array (some models send one despite the declared type) still works.
test('GitAdd accepts an array of paths', async () => {
  const dir = await repo()
  await fs.writeFile(path.join(dir, 'a.txt'), 'a', 'utf-8')
  const tools = createGitTools(dir)
  await tool(tools, 'GitAdd').fn({ paths: ['a.txt'] })
  const staged = await run('git', ['diff', '--cached', '--name-only'], {
    cwd: dir,
  })
  assert.equal(staged.stdout.trim(), 'a.txt')
  await fs.rm(dir, { recursive: true, force: true })
})

test('GitAdd with no paths stages everything (sentinel not mistaken for output)', async () => {
  const dir = await repo()
  await fs.writeFile(path.join(dir, 'a.txt'), 'a', 'utf-8')
  const tools = createGitTools(dir)
  const out = await tool(tools, 'GitAdd').fn({})
  assert.ok(String(out).length > 0)
  assert.notEqual(String(out).trim(), NO_OUTPUT_SENTINEL)
  await fs.rm(dir, { recursive: true, force: true })
})
