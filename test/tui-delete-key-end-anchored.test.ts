import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// In the /config editor the value buffer is edited at its END only (there is
// no cursor state). Backspace deletes the last character — correct. But the
// FORWARD-DELETE key (`ESC[3~`, Ink reports it as `key.delete`) was mapped to
// the SAME action: pressing Delete while editing an existing value silently
// removed its last character, and Enter then SAVED the shortened value. A
// terminal that sends Delete on its own (or a stuck key) quietly corrupts a
// setting.
//
// The rule: only BACKSPACE deletes (there is nothing after the cursor to
// delete forward), Delete must be a no-op in an end-anchored editor.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the config editor does not treat Delete as backspace', () => {
  const offenders: string[] = []
  for (const file of [
    'AskQuestion.tsx',
    'ConfigMenu.tsx',
    'LoginForm.tsx',
    'TextPrompt.tsx',
  ]) {
    const src = fs.readFileSync(path.join(root, 'src', 'tui', file), 'utf-8')
    const lines = src.split(String.fromCharCode(10))
    lines.forEach((line, i) => {
      if (/key\.backspace\s*\|\|\s*key\.delete/.test(line))
        offenders.push(file + ':' + (i + 1) + ' ' + line.trim())
    })
  }
  assert.deepEqual(
    offenders,
    [],
    'Delete is treated as Backspace in:\n' + offenders.join('\n'),
  )
})
