import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The CLI parses flags in two places (getPositional's skip-list and the
// hasFlag/getArg calls) and advertises them in printHelp via help.opt.* keys.
// This test guards the invariant that every advertised `--flag` is actually
// recognized, and that the positional parser does not skip a value for a flag
// that does not exist (the old `--project` bug swallowed its argument).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/index.ts'), 'utf-8')
const i18n = fs.readFileSync(path.join(root, 'src/i18n.ts'), 'utf-8')

// Flags advertised in the help text (the literal `--name` before the help.opt
// i18n key on the same template line).
function advertisedFlags(): string[] {
  const out: string[] = []
  for (const line of src.split('\n')) {
    if (!line.includes('help.opt.')) continue
    const m = line.match(/--([a-z][a-z0-9-]*)/)
    if (m) out.push('--' + m[1])
  }
  return out
}

// Flags that the code actually branches on: hasFlag('--x') or getArg('--x').
function handledFlags(): Set<string> {
  const set = new Set<string>()
  for (const m of src.matchAll(/hasFlag\('(--[a-z0-9-]+)'\)/g)) set.add(m[1])
  for (const m of src.matchAll(/getArg\('(--[a-z0-9-]+)'/g)) set.add(m[1])
  return set
}

// Flags handled outside index.ts (color.ts reads --no-color at module load).
const HANDLED_ELSEWHERE = ['--no-color']

test('every advertised --flag is handled in code', () => {
  const handled = handledFlags()
  const missing = advertisedFlags().filter(
    (f) => !handled.has(f) && !HANDLED_ELSEWHERE.includes(f),
  )
  assert.deepEqual(
    missing,
    [],
    'advertised but not handled: ' + missing.join(', '),
  )
})

test('getPositional only skips value-flags that are handled', () => {
  const handled = handledFlags()
  // Prettier may wrap the call, so allow whitespace/newlines around the
  // array and the .includes(a) argument.
  const m = src.match(/if \(\s*\[([^\]]+)\]\.includes\(\s*a,?\s*\)\s*\)/)
  assert.ok(m, 'getPositional skip-list not found')
  const names = [...m[1].matchAll(/'(--[a-z0-9-]+)'/g)].map((x) => x[1])
  assert.ok(names.length > 0, 'skip-list is empty')
  const bad = names.filter((n) => !handled.has(n))
  assert.deepEqual(
    bad,
    [],
    'skip-list consumes a value for an unhandled flag: ' + bad.join(', '),
  )
})

test('no help.opt key is orphaned in the catalog', () => {
  // Every help.opt.* key in i18n must be rendered by printHelp.
  const keys = [...i18n.matchAll(/'(help\.opt\.[a-z_]+)'/g)].map((x) => x[1])
  const orphan = [...new Set(keys)].filter((k) => !src.includes("'" + k + "'"))
  assert.deepEqual(orphan, [], 'orphaned help.opt keys: ' + orphan.join(', '))
})
