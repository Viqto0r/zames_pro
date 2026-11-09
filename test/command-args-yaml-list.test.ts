import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadProjectContext } from '../src/context.ts'
import { makeTmpDir } from './tmp-dir.ts'

// A custom command declares its arguments either inline (`arguments: env mode`)
// or as a YAML BLOCK LIST — the documented Claude Code form:
//
//   arguments:
//     - env
//     - mode
//
// The parser folded the continuation lines into one string and split on
// whitespace, so the list markers became argument NAMES: `arguments` came out
// as `['-', 'env', '-', 'mode']`, every declared name was "missing" and the
// command was refused before it could run.
const NL = String.fromCharCode(10)

test('a YAML block list of arguments parses to the real names', async (t) => {
  // `makeTmpDir` puts the dir under os.tmpdir() and registers the cleanup:
  // `tmp/` is GITIGNORED, so a CI checkout has no such directory and a
  // `mkdtemp` inside the repo failed with ENOENT.
  const dir = await makeTmpDir(t, 'cmd-args-')
  await fs.mkdir(path.join(dir, '.zames', 'commands'), { recursive: true })
  await fs.writeFile(
    path.join(dir, '.zames', 'commands', 'c.md'),
    [
      '---',
      'description: d',
      'arguments:',
      '  - env',
      '  - mode',
      '---',
      'body $env $mode',
    ].join(NL),
  )
  const ctx = await loadProjectContext(dir)
  const cmd = ctx.commands.find((c) => c.name === 'c')
  assert.ok(cmd, 'the command was not loaded')
  assert.deepEqual(cmd.arguments, ['env', 'mode'])
})

test('the inline form keeps working', async (t) => {
  const dir = await makeTmpDir(t, 'cmd-args2-')
  await fs.mkdir(path.join(dir, '.zames', 'commands'), { recursive: true })
  await fs.writeFile(
    path.join(dir, '.zames', 'commands', 'd.md'),
    ['---', 'description: d', 'arguments: env mode', '---', 'body'].join(NL),
  )
  const ctx = await loadProjectContext(dir)
  assert.deepEqual(ctx.commands.find((c) => c.name === 'd')?.arguments, [
    'env',
    'mode',
  ])
})
