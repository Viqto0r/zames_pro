// looksLikeFileName()/looksLikeFilePath() decide whether a PASTED text is a
// file to attach (the input line turns it into [file#N]). The name test used
// `/^[\w.\- ]+\.[A-Za-z0-9]{1,8}$/` — and `\w` in JS is ASCII-ONLY without the
// `u` flag, so every non-Latin file name was rejected: `отчёт.pdf`,
// `документ 1.txt`, `文件.txt`, `café.png`. The operator pasted a real file name
// and got plain text in the message instead of an attachment (the marker never
// appeared). Punctuation that is legal in downloads (`report (1).pdf`,
// `file+1.png`, `a&b.txt`) failed the same way.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeFileName, looksLikeFilePath } from '../src/attachments.ts'

test('a non-Latin file name is recognized', () => {
  for (const n of [
    'отчёт.pdf',
    'документ 1.txt',
    '文件.txt',
    'café.png',
    'naïve.md',
  ]) {
    assert.equal(looksLikeFileName(n), true, n)
    assert.equal(looksLikeFilePath(n), true, n)
  }
})

test('a download-style name with punctuation is recognized', () => {
  for (const n of [
    'report (1).pdf',
    'my file (2).png',
    'file[1].txt',
    'file+1.png',
    'a&b.txt',
  ]) {
    assert.equal(looksLikeFileName(n), true, n)
  }
})

test('plain prose is still not a file name', () => {
  for (const n of ['hello world', 'просто текст', 'a b', '', '  ']) {
    assert.equal(looksLikeFileName(n), false, n)
  }
})
