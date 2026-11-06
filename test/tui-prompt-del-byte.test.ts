import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A terminal (or the kitty keyboard protocol) can report the DEL byte 0x7f as
// ORDINARY input instead of key.backspace. `input >= ' '` is TRUE for 127, so
// every prompt that used that check appended an invisible control character to
// the value: the login e-mail, the MFA code, a config value, an answer to a
// question. `src/tui/keys.ts` (the main editor) already excludes DEL; the Ink
// prompt components were missed, so the operator's typed secret carried a
// hidden byte and the sign-in failed with "wrong password/code".
//
// This guard fails as soon as any prompt component goes back to the bare
// `input >= ' '` check.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROMPTS = [
  'AskQuestion.tsx',
  'ConfigMenu.tsx',
  'LoginForm.tsx',
  'TextPrompt.tsx',
]

function source(file: string): string {
  return fs.readFileSync(path.join(root, 'src', 'tui', file), 'utf-8')
}

test('no prompt component accepts the raw DEL byte as text', () => {
  const offenders: string[] = []
  for (const file of PROMPTS) {
    const src = source(file)
    const lines = src.split(String.fromCharCode(10))
    lines.forEach((line, i) => {
      if (!/input >= ' '/.test(line)) return
      // The shared helper `isPrintableInput` is the only allowed form.
      if (/isPrintableInput/.test(line)) return
      offenders.push(file + ':' + (i + 1) + ' ' + line.trim())
    })
  }
  assert.deepEqual(
    offenders,
    [],
    "bare `input >= ' '`:\n" + offenders.join('\n'),
  )
})

test('the shared helper rejects DEL and keeps printable text', async () => {
  const { isPrintableInput } = await import('../src/tui/keys.ts')
  assert.equal(isPrintableInput(String.fromCharCode(127)), false)
  assert.equal(isPrintableInput('a'), true)
  assert.equal(isPrintableInput(' '), true)
  assert.equal(isPrintableInput('ы'), true)
})
