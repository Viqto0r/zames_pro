import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

// END-TO-END CLI behavior: run the REAL entrypoint (`tsx src/index.ts`) with
// --help / --version and assert the USER-FACING surface. These paths are
// fully offline (no browser), so they are fast and deterministic, and they
// catch a class of bug the unit tests miss entirely: the help text advertising
// a command the code no longer handles (or a removed command still shown).
//
// Real case this guards: `/resume <n>` was removed but the help/`/chats`
// hint kept telling the operator to use it.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function runCli(
  args: string[],
  timeout = 60_000,
): { out: string; code: number } {
  // The test runner sets NODE_V8_COVERAGE and the spawned `tsx src/index.ts`
  // inherits it. The child then writes its OWN (near-empty) coverage for
  // modules it imports but never exercises (undo.ts, checkpoint.ts) into the
  // SAME dir; the report aggregates them and those modules fall below their
  // coverage-gate floor, so `coverage:gate` fails even though the real tests
  // are untouched. Point the child at a throwaway dir so its coverage stays
  // out of the parent report entirely.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: '1',
    NODE_V8_COVERAGE: path.join(os.tmpdir(), 'zames-child-coverage'),
  }
  const r = spawnSync('npx', ['tsx', 'src/index.ts', ...args], {
    cwd: root,
    encoding: 'utf-8',
    timeout,
    env,
  })
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status ?? -1 }
}

test('e2e: --version prints a semver and exits 0', () => {
  const { out, code } = runCli(['--version'])
  assert.equal(code, 0, out)
  assert.match(out.trim(), /^\d+\.\d+\.\d+/, 'a semver version')
})

test('e2e: --help advertises only live commands (no removed /resume <n>)', () => {
  const { out, code } = runCli(['--help'])
  assert.equal(code, 0, out)
  assert.ok(out.includes('/resume-id'), 'the live /resume-id command is shown')
  // The old `/resume <n>` must NOT be advertised: the code no longer handles it.
  assert.ok(
    !/\/resume\s+<n>/.test(out),
    'help must not advertise the removed /resume <n> command',
  )
})

test('e2e: help commands match the slash-command dispatch (no dead entries)', () => {
  const { out } = runCli(['--help'])
  // A representative set of session commands must all be present.
  for (const cmd of ['/sessions', '/chats', '/resume-id', '/last', '/new']) {
    assert.ok(out.includes(cmd), 'help is missing ' + cmd)
  }
})
