import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOG } from '../src/i18n.ts'

// Guards against i18n ROT: a key that no longer has a call site (the
// confirm-subsystem removal left `confirm.hint` / `confirm.ask_label` behind;
// the /resume removal left `help.cmd.resume` and four `chats.*` keys).
//
// IMPORTANT: the haystack must EXCLUDE the i18n definition files
// (src/i18n/*.ts and src/i18n.ts). A key is DEFINED there, so including those
// files made every key match itself and the test could never flag an orphan —
// it was vacuously green (this was a real bug in the test: it shipped
// `chats.resume_usage` et al. unnoticed). A key counts as "used" only when a
// NON-i18n source or test file references it.
//
// A dynamic key built by concatenation would be a false positive; any such key
// must be listed in ALLOW with a comment. None do that today.
//
// `skill.desc.<name>` is built at runtime in refreshDynamicCommands()
// (src/index.ts) as 'skill.desc.' + skillName, so the full key never appears
// as a literal. The known skill names are fixed, so list them explicitly.
const ALLOW: string[] = [
  'skill.desc.commit',
  'skill.desc.review',
  'skill.desc.test',
  'skill.desc.debug',
  'skill.desc.explain',
  'skill.desc.brainstorming',
  'skill.desc.writing-plans',
  'skill.desc.test-driven-development',
  'skill.desc.systematic-debugging',
  'skill.desc.verification-before-completion',
]

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** True for the files that DEFINE the catalog (excluded from "usage"). */
function isI18nDefinition(full: string): boolean {
  return /[\\/]src[\\/]i18n(\.ts|[\\/][^\\/]+\.ts)$/.test(full)
}

function readAll(dir: string, ext: string): string {
  let out = ''
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'tmp') continue
      out += readAll(full, ext)
    } else if (full.endsWith(ext)) {
      if (isI18nDefinition(full)) continue
      out += fs.readFileSync(full, 'utf-8') + '\n'
    }
  }
  return out
}

test('every catalog key is referenced from a non-i18n source/test file', () => {
  // Both .ts and .tsx (the Ink TUI components use keys too — missing .tsx
  // made live keys look orphaned).
  const hay =
    readAll(path.join(root, 'src'), '.ts') +
    readAll(path.join(root, 'src'), '.tsx') +
    readAll(root, '.ts') +
    readAll(root, '.tsx')
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
