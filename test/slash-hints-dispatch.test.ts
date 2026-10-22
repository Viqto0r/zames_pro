import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLASH_COMMANDS, DEV_ONLY_COMMANDS } from '../src/commands.ts'

// The «/» completion list is built from SLASH_COMMANDS; the main loop
// dispatches commands by name. A command that is DISPATCHED but missing from
// the table is invisible in the hints (the operator has to know it by heart);
// a command in the table but NOT dispatched is a dead entry.

const here = path.dirname(fileURLToPath(import.meta.url))
const src = fs.readFileSync(path.join(here, '..', 'src', 'index.ts'), 'utf-8')

function dispatchedNames(): Set<string> {
  const out = new Set<string>()
  for (const m of src.matchAll(/lower === '([a-z0-9/-]+)'/g)) out.add(m[1])
  for (const m of src.matchAll(/lower\.startsWith\('([a-z0-9/-]+)'/g)) {
    out.add(m[1])
  }
  return out
}

// Command aliases / hidden forms the operator does not need advertised.
const ALIASES = new Set(['/history', '/usage', '/checkpoints', '/session', '/'])

test('every dispatched slash command is advertised in SLASH_COMMANDS', () => {
  const advertised = new Set(SLASH_COMMANDS.map((c) => c.name.toLowerCase()))
  for (const c of DEV_ONLY_COMMANDS) advertised.add(c)
  const missing = [...dispatchedNames()]
    .filter((n) => n.startsWith('/') && !n.includes(' '))
    .filter((n) => !ALIASES.has(n))
    .filter((n) => !advertised.has(n))
    .sort()
  assert.deepEqual(
    missing,
    [],
    'dispatched but not in the «/» hints: ' + missing.join(', '),
  )
})
