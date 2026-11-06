import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeFileName } from '../src/attachments.ts'

// A pasted VERSION (`2.96.15`, `v1.2.3`, `1.0`) was classified as a FILE NAME:
// the extension rule only requires 1-8 alphanumerics after the LAST dot, so
// `15` / `3` / `0` count as an extension. A semver paste then goes down the
// attach path (an fs probe against the project), and a release artifact named
// exactly that turns into an attachment instead of staying text.
//
// A file name's extension must look like an extension, not like a NUMBER.

test('a semantic version is not a file name', () => {
  for (const v of ['2.96.15', 'v1.2.3', '1.0', '10.20.30']) {
    assert.equal(looksLikeFileName(v), false, v)
  }
})

test('a real file name is still recognized', () => {
  for (const f of ['report.pdf', 'a.txt', 'photo.png', 'отчёт.pdf']) {
    assert.equal(looksLikeFileName(f), true, f)
  }
})
