import test from 'node:test'
import assert from 'node:assert/strict'
import { extractAtFileRefs } from '../src/path-token.ts'

// A task text often lists files with a SEMICOLON or a second at-sign as the
// separator. The scanner ended only on whitespace/brackets, so the whole
// thing became ONE path whose extension consumed the separator —
// looksLikeToken then failed and BOTH files were silently dropped.

test('at-refs: a semicolon-separated list is two refs', () => {
  assert.deepEqual(extractAtFileRefs('compare @a.ts;@b.ts'), ['a.ts', 'b.ts'])
})

test('at-refs: a second at-sign is NOT a separator (email shape)', () => {
  // `@a.ts@b.ts` has the shape of an EMAIL/decorator (`user@host`), and the
  // guard against `user@host`/`@Component` rejects it — a glued path could not
  // be inlined anyway. Real list forms use a comma or a semicolon.
  const A = String.fromCharCode(64)
  assert.deepEqual(extractAtFileRefs('@a.ts' + A + 'b.ts'), [])
  assert.deepEqual(extractAtFileRefs('user' + A + 'host.com'), [])
})

test('at-refs: a semicolon inside a path is kept', () => {
  // No separator before the extension: this is one real file name.
  assert.deepEqual(extractAtFileRefs('@a;b.ts'), ['a;b.ts'])
})
