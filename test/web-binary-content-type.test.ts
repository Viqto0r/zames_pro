import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isBinaryContentType } from '../src/web.ts'

// WebFetch dumps a response BODY into the model's context. A binary type that
// is not on the list is read as text and floods the context with mojibake, so
// the common archive/executable spellings must all be recognised. The list had
// `x-gzip`/`x-rar`/`x-7z` but not the equally common `x-zip` and
// `x-msdownload` (a Windows EXE), and `application/epub+zip` slipped through the
// `+json|+xml` text exceptions.

test('the common archive/executable spellings are binary', () => {
  for (const ct of [
    'application/x-zip',
    'application/x-zip-compressed',
    'application/x-msdownload',
    'application/epub+zip',
    'application/x-rar-compressed',
    'application/gzip',
  ]) {
    assert.equal(isBinaryContentType(ct), true, ct + ' was read as text')
  }
})

test('textual types are still text', () => {
  for (const ct of [
    'text/html',
    'application/json',
    'application/ld+json',
    'application/xml',
    'text/plain; charset=utf-8',
  ]) {
    assert.equal(isBinaryContentType(ct), false, ct + ' was read as binary')
  }
})
