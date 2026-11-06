import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// `/jobs rm <id>` is parsed from the trimmed, lowercased rest with
// `sub.startsWith('rm ')` and `sub.startsWith('remove ')`. A TAB between the
// verb and the id (`rm\t3` — a shell-style completion or a paste) matches
// NEITHER, so the command falls through to the plain LIST and the job is
// silently NOT removed; the operator sees the list again and assumes it
// worked. The parser must accept any whitespace run after the verb.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the /jobs remove parser accepts any whitespace after the verb', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf-8')
  assert.doesNotMatch(
    src,
    /startsWith\('rm '\)/,
    "the parser still requires a literal space after 'rm'",
  )
  assert.doesNotMatch(
    src,
    /startsWith\('remove '\)/,
    "the parser still requires a literal space after 'remove'",
  )
})
