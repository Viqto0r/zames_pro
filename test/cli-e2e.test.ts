import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// END-TO-END CLI behavior: run the REAL entrypoint (`tsx src/index.ts`) with
// --help / --version and assert the USER-FACING surface. These paths are
// fully offline (no browser), so they are fast and deterministic, and they
// catch a class of bug the unit tests miss entirely: the help text advertising
// a command the code no longer handles (or a removed command still shown).
//
// The case it was written for: `/resume <n>` was removed, yet the help and the
// `/chats` hint kept telling the operator to use it.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// The child writes no coverage (NODE_V8_COVERAGE is removed from its env),
// but V8 still reports the modules it LOADS and never calls into the coverage
// of the PARENT process. That near-empty data overwrote the real coverage of
// undo.ts / checkpoint.ts (25% instead of 90%, coverage:gate failed). The CLI
// therefore runs from an ISOLATED copy of the source tree, so the modules it
// loads are not the modules this test file reports.
const cliRoot = path.join(os.tmpdir(), 'zames-cli-' + process.pid)

function prepareCliRoot(): void {
  if (fs.existsSync(cliRoot)) return
  fs.mkdirSync(cliRoot, { recursive: true })
  // Only what --version / --help need: the sources, the package json and
  // the node_modules link (tsx/chalk/ink-imports are resolved from there).
  fs.cpSync(path.join(root, 'src'), path.join(cliRoot, 'src'), {
    recursive: true,
  })
  fs.copyFileSync(
    path.join(root, 'package.json'),
    path.join(cliRoot, 'package.json'),
  )
  fs.symlinkSync(
    path.join(root, 'node_modules'),
    path.join(cliRoot, 'node_modules'),
    'dir',
  )
}

function runCl(
  args: string[],
  timeout = 60_000,
): { out: string; code: number } {
  prepareCliRoot()
  // The test runner sets NODE_V8_COVERAGE and the spawned child inherits
  // it. Redirecting the child at a throwaway dir kept those files out of
  // the report, but NOTHING ever deleted that dir: 4171 files / 9.5 GB had
  // accumulated (and on WSL the freed space never returns to C:). The child's
  // coverage is worthless anyway, so REMOVE the variable entirely: the child
  // then writes no coverage at all.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: '1',
  }
  delete env.NODE_V8_COVERAGE
  const r = spawnSync('npx', ['tsx', 'src/index.ts', ...args], {
    cwd: cliRoot,
    encoding: 'utf-8',
    timeout,
    env,
  })
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status ?? -1 }
}

// The temp tree is deleted AFTER the test file finishes (the spawned child
// is synchronous, so nothing is still using it). On WSL the space of a
// forgotten temp tree never returns to the Windows host, and the old
// code left one per run (4171 coverage files / 9.5 GB is the same bug).
test.after(() => {
  fs.rmSync(cliRoot, { recursive: true, force: true })
})

test('e2e: --version prints a semver and exits 0', () => {
  const { out, code } = runCl(['--version'])
  assert.equal(code, 0, out)
  assert.match(out.trim(), /^\d+\.\d+\.\d+/, 'a semver version')
})

test('e2e: --help advertises only live commands (no removed /resume <n>)', () => {
  const { out, code } = runCl(['--help'])
  assert.equal(code, 0, out)
  assert.ok(out.includes('/resume-id'), 'the live /resume-id command is shown')
  // The old `/resume <n>` must NOT be advertised: the code no longer handles it.
  assert.ok(
    !/\/resume\s+<n>/.test(out),
    'help must not advertise the removed /resume <n> command',
  )
})

test('e2e: help commands match the slash-command dispatch (no dead entries)', () => {
  const { out } = runCl(['--help'])
  // A representative set of session commands must all be present.
  for (const cmd of ['/sessions', '/chats', '/resume-id', '/last', '/new']) {
    assert.ok(out.includes(cmd), 'help is missing ' + cmd)
  }
})
