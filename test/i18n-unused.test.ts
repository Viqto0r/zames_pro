import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOG } from '../src/i18n.ts'

// Guards against i18n ROT: a key that no longer has a call site (the
// confirm-subsystem removal left `confirm.hint` / `confirm.ask_label` behind).
// A key is considered used when its quoted name appears anywhere in src/ or
// test/ — dynamic keys built by concatenation would be a false positive, so any
// such key must be listed in the allowlist below with a comment explaining why.
//
// Known dynamic keys: none currently build a key at runtime from user input;
// the counters here are literal. Keep the allowlist empty unless that changes.
const ALLOW: string[] = []

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readAll(dir: string, ext: string): string {
  let out = ''
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'tmp') continue
      out += readAll(full, ext)
    } else if (full.endsWith(ext)) {
      out += fs.readFileSync(full, 'utf-8') + '\n'
    }
  }
  return out
}

test('every catalog key is referenced somewhere in src/ or test/', () => {
  const hay = readAll(path.join(root, 'src'), '.ts') + readAll(root, '.ts')
  const unused: string[] = []
  for (const key of Object.keys(CATALOG)) {
    if (ALLOW.includes(key)) continue
    if (!hay.includes("'" + key + "'")) unused.push(key)
  }
  assert.deepEqual(
    unused,
    [],
    'unused i18n keys (dead strings): ' + unused.join(', '),
  )
})
