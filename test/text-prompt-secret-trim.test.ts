import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The TUI one-line prompt (the DeepSeek MFA code, a Qwen login code) submitted
// `value.trim()`. For the EMAIL prompt that is harmless; for a SECRET it
// silently changes what the operator typed — the same bug that was fixed in
// `/config set <password>` (a password may legally carry spaces). The MFA
// consumer strips whitespace itself before sending, so the prompt must pass the
// raw value through.
//
// The guard pins the SOURCE: the secret path does not trim.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the text prompt does not trim a secret', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'tui', 'TextPrompt.tsx'),
    'utf-8',
  )
  assert.doesNotMatch(
    src,
    /finish\(value\.trim\(\)\)/,
    'the prompt still trims every value, including secrets',
  )
  assert.match(src, /secret\s*\?\s*value\s*:\s*value\.trim\(\)/)
})
