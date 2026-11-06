import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The AskQuestion modal word-wraps the model's question to the box width. The
// wrapper never broke inside a WORD: a question with a long path or URL (very
// common — "open https://host/very/long/path") produced a row WIDER than the
// box, Ink wrapped it itself, and the extra row was not counted — the border
// and the option rows shifted.
//
// The guard pins the SOURCE: the wrapper must split a word that does not fit.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the ask-question wrapper splits a word longer than the box', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'tui', 'AskQuestion.tsx'),
    'utf-8',
  )
  assert.match(
    src,
    /cand\.length > innerCols && line/,
    'the word-boundary case is gone',
  )
  assert.match(
    src,
    /w\.length > innerCols/,
    'a word longer than the box is never split',
  )
})
