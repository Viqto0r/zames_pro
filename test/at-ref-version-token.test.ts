import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractAtFileRefs } from '../src/path-token.ts'

// `looksLikeToken` decides whether an `@token` is a FILE reference by looking
// at the extension after the last dot: 1-8 alphanumerics. An ALL-DIGIT
// extension therefore passes, so a pasted VERSION (`see @2.96.15`) is treated
// as an `@file` reference: the inliner probes the project for a file by that
// name and a release artifact named exactly so is inlined into the prompt.
//
// The same rule was just fixed in `attachments.looksLikeFileName`; the
// reference scanner must agree with it.

test('a version is not a file reference', () => {
  for (const v of ['@2.96.15', '@v1.2.3', '@1.0']) {
    assert.deepEqual(extractAtFileRefs('see ' + v), [], v)
  }
})

test('real file references still work', () => {
  assert.deepEqual(extractAtFileRefs('open @a.ts'), ['a.ts'])
  assert.deepEqual(extractAtFileRefs('use @src/a.ts,@src/b.ts'), [
    'src/a.ts',
    'src/b.ts',
  ])
})
