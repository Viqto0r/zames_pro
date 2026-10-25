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
import { makeTmpDir } from './tmp-dir.ts'

// Regression tests: each one failed before the matching fix (a shell
// injection, a symlink escape, or a silent $-pattern corruption in Edit).

const D = String.fromCharCode(36)
const BT = String.fromCharCode(96)
const SPECIAL = 'X' + D + '&Y' + D + D + 'Z' + D + '1' + D + BT + 'Q' + D + "'R"

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x['name'] === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

function tmpDir(
  t: { after: (fn: () => unknown) => unknown },
  prefix: string,
): Promise<string> {
  return makeTmpDir(t, prefix)
}

async function rm(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true })
}

test('Edit writes $-patterns in new_string literally', async (t) => {
  const dir = await tmpDir(t, 'zames-n1-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'abc', 'utf-8')
  const tools = createTools(dir, {})
  await tool(tools, 'Edit').fn({
    path: 'a.txt',
    old_string: 'b',
    new_string: SPECIAL,
  })
  const data = await fs.readFile(path.join(dir, 'a.txt'), 'utf-8')
  assert.equal(data, 'a' + SPECIAL + 'c')
})

test('MultiEdit writes $-patterns in new_string literally', async (t) => {
  const dir = await tmpDir(t, 'zames-n1m-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'abc', 'utf-8')
  const tools = createExtraTools(dir, {})
  await tool(tools, 'MultiEdit').fn({
    path: 'a.txt',
    edits: [{ old_string: 'b', new_string: SPECIAL }],
  })
  const data = await fs.readFile(path.join(dir, 'a.txt'), 'utf-8')
  assert.equal(data, 'a' + SPECIAL + 'c')
})

test('Grep does not execute a $(...) pattern as a command', async (t) => {
  if (process.platform === 'win32') return
  const dir = await tmpDir(t, 'zames-n2-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'hello', 'utf-8')
  await fs.mkdir(path.join(dir, 'tmp'), { recursive: true })
  const tools = createTools(dir, {})
  await tool(tools, 'Grep').fn({ pattern: 'x' + D + '(touch tmp/PWNED)y' })
  assert.equal(fsSync.existsSync(path.join(dir, 'tmp', 'PWNED')), false)
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

test('file tools reject a symlink pointing outside the root', async (t) => {
  if (process.platform === 'win32') return
  const dir = await tmpDir(t, 'zames-n19-')
  const outside = await tmpDir(t, 'zames-n19-out-')
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
})

test('GitShow rejects a ref that could inject shell/options', async (t) => {
  const dir = await tmpDir(t, 'zames-n17-')
  execFileSync('git', ['init', '-q'], { cwd: dir })
  const tools = createGitTools(dir)
  const out = String(
    await tool(tools, 'GitShow').fn({ ref: 'HEAD' + D + '(touch tmp/PWNED)' }),
  )
  assert.match(out, /invalid ref/)
  assert.equal(fsSync.existsSync(path.join(dir, 'tmp', 'PWNED')), false)
})

test('GitDiff does not execute a $(...) path', async (t) => {
  if (process.platform === 'win32') return
  const dir = await tmpDir(t, 'zames-n18-')
  execFileSync('git', ['init', '-q'], { cwd: dir })
  const tools = createGitTools(dir)
  await tool(tools, 'GitDiff').fn({ path: 'x' + D + '(touch tmp/PWNED)y' })
  assert.equal(fsSync.existsSync(path.join(dir, 'tmp', 'PWNED')), false)
})

test('assertCommandInsideRoot blocks chroot but not legitimate shells', () => {
  const root = path.join(os.tmpdir(), 'zames-sbx-root2')
  // chroot switches the process root outright — always forbidden.
  assert.throws(() => assertCommandInsideRoot(root, 'chroot / ls'), /Sandbox/)
  // Legitimate commands stay allowed: `bash -c`/`nohup bash -c` run a
  // background job and must NOT be blocked (a blanket ban broke real usage).
  assert.doesNotThrow(() => assertCommandInsideRoot(root, "sh -c 'ls -la'"))
  assert.doesNotThrow(() =>
    assertCommandInsideRoot(root, "nohup bash -c 'sleep 1' &"),
  )
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'ls -la'))
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'npm test'))
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'node script.js'))
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'python build.py'))
})

// The eval+cd guard matched RAW SUBSTRINGS. A perfectly normal command that
// merely CONTAINS the word `eval` somewhere (a test file named
// `goal-eval-unparsable.test.ts`, a directory `eval/`) was rejected as
// "eval with cd is forbidden" — even `npm test` when the run line had a `cd`.
// eval only re-parses its argument when it is actually EXECUTED, so the guard
// must look at command positions.
test('the eval guard does not fire on the word eval inside a path', () => {
  const root = path.join(os.tmpdir(), 'zames-sbx-eval')
  assert.doesNotThrow(() =>
    assertCommandInsideRoot(
      root,
      'cd sub && npx tsx --test test/goal-eval-unparsable.test.ts',
    ),
  )
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'grep -rn eval src'))
  // A REAL eval still hits the guard when a cd is present.
  assert.throws(
    () => assertCommandInsideRoot(root, "eval 'cd /etc'"),
    /Sandbox/,
  )
  assert.throws(
    () => assertCommandInsideRoot(root, 'cd sub && eval ls'),
    /Sandbox/,
  )
})
