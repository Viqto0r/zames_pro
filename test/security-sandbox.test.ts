import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createTools } from '../src/tools.ts'
import { createExtraTools } from '../src/extraTools.ts'
import { createGitTools } from '../src/gitTools.ts'
import { assertCommandInsideRoot } from '../src/shell.ts'
import type { ToolDef } from '../src/types.ts'

// P0 regression tests: each one failed before the matching fix (a shell
// injection, a symlink escape, or a silent $-pattern corruption in Edit).

const D = String.fromCharCode(36)
const BT = String.fromCharCode(96)
const SPECIAL = 'X' + D + '&Y' + D + D + 'Z' + D + '1' + D + BT + 'Q' + D + "'R"

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x['name'] === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

function tmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

async function rm(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true })
}

test('Edit writes $-patterns in new_string literally', async () => {
  const dir = await tmpDir('zames-n1-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'abc', 'utf-8')
  const tools = createTools(dir, {})
  await tool(tools, 'Edit').fn({
    path: 'a.txt',
    old_string: 'b',
    new_string: SPECIAL,
  })
  const data = await fs.readFile(path.join(dir, 'a.txt'), 'utf-8')
  assert.equal(data, 'a' + SPECIAL + 'c')
  await rm(dir)
})

test('MultiEdit writes $-patterns in new_string literally', async () => {
  const dir = await tmpDir('zames-n1m-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'abc', 'utf-8')
  const tools = createExtraTools(dir, {})
  await tool(tools, 'MultiEdit').fn({
    path: 'a.txt',
    edits: [{ old_string: 'b', new_string: SPECIAL }],
  })
  const data = await fs.readFile(path.join(dir, 'a.txt'), 'utf-8')
  assert.equal(data, 'a' + SPECIAL + 'c')
  await rm(dir)
})

test('Grep does not execute a $(...) pattern as a command', async () => {
  if (process.platform === 'win32') return
  const dir = await tmpDir('zames-n2-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'hello', 'utf-8')
  await fs.mkdir(path.join(dir, 'tmp'), { recursive: true })
  const tools = createTools(dir, {})
  await tool(tools, 'Grep').fn({ pattern: 'x' + D + '(touch tmp/PWNED)y' })
  assert.equal(fsSync.existsSync(path.join(dir, 'tmp', 'PWNED')), false)
  await rm(dir)
})

test('assertCommandInsideRoot blocks cd ~ / $HOME / subshell / eval', () => {
  const root = path.join(os.tmpdir(), 'zames-sbx-root')
  assert.throws(() => assertCommandInsideRoot(root, 'cd ~ && ls'), /Sandbox/)
  assert.throws(
    () => assertCommandInsideRoot(root, 'cd ' + D + 'HOME && ls'),
    /Sandbox/,
  )
  assert.throws(
    () => assertCommandInsideRoot(root, 'cd "' + D + 'HOME" && ls'),
    /Sandbox/,
  )
  assert.throws(
    () => assertCommandInsideRoot(root, '(cd /etc && ls)'),
    /Sandbox/,
  )
  assert.throws(
    () => assertCommandInsideRoot(root, 'eval "cd /etc"'),
    /Sandbox/,
  )
})

test('file tools reject a symlink pointing outside the root', async () => {
  if (process.platform === 'win32') return
  const dir = await tmpDir('zames-n19-')
  const outside = await tmpDir('zames-n19-out-')
  const secret = path.join(outside, 'secret.txt')
  await fs.writeFile(secret, 'TOP SECRET', 'utf-8')
  fsSync.symlinkSync(secret, path.join(dir, 'link'))
  fsSync.symlinkSync(outside, path.join(dir, 'dirlink'))

  const tools = createTools(dir, {})
  await assert.rejects(
    async () => tool(tools, 'Read').fn({ path: 'link' }),
    /outside the working directory/,
  )
  await assert.rejects(
    async () =>
      tool(tools, 'Write').fn({ path: 'dirlink/evil.txt', content: 'x' }),
    /outside the working directory/,
  )
  assert.equal(fsSync.existsSync(path.join(outside, 'evil.txt')), false)
  await rm(dir)
  await rm(outside)
})

test('GitShow rejects a ref that could inject shell/options', async () => {
  const dir = await tmpDir('zames-n17-')
  execFileSync('git', ['init', '-q'], { cwd: dir })
  const tools = createGitTools(dir)
  const out = String(
    await tool(tools, 'GitShow').fn({ ref: 'HEAD' + D + '(touch tmp/PWNED)' }),
  )
  assert.match(out, /invalid ref/)
  assert.equal(fsSync.existsSync(path.join(dir, 'tmp', 'PWNED')), false)
  await rm(dir)
})

test('GitDiff does not execute a $(...) path', async () => {
  if (process.platform === 'win32') return
  const dir = await tmpDir('zames-n18-')
  execFileSync('git', ['init', '-q'], { cwd: dir })
  const tools = createGitTools(dir)
  await tool(tools, 'GitDiff').fn({ path: 'x' + D + '(touch tmp/PWNED)y' })
  assert.equal(fsSync.existsSync(path.join(dir, 'tmp', 'PWNED')), false)
  await rm(dir)
})
