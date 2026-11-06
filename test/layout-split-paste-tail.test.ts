import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitPasteTail } from '../src/input/layout.ts'

// A bracketed paste can be SPLIT between two terminal reads anywhere inside the
// `ESC[200~` / `ESC[201~` marker. `splitPasteTail` holds a genuine PARTIAL
// marker back so the caller can reassemble it. The scan window was
// `Math.min(maxHold, str.length - 1)`, so for a 1-character chunk it was 0 and
// NOTHING was held: a read that ended with a lone ESC leaked it into the
// buffer (a bare control character) instead of waiting for the rest.
const ESC = String.fromCharCode(27)

test('a lone ESC chunk is held back as a possible marker start', () => {
  assert.deepEqual(splitPasteTail(ESC), { head: '', tail: ESC })
})

test('a 2-character partial marker is held back', () => {
  assert.deepEqual(splitPasteTail(ESC + '['), { head: '', tail: ESC + '[' })
  assert.deepEqual(splitPasteTail(ESC + '[2'), {
    head: '',
    tail: ESC + '[2',
  })
})

test('a complete marker is not a tail', () => {
  assert.deepEqual(splitPasteTail('abc' + ESC + '[200~'), {
    head: 'abc' + ESC + '[200~',
    tail: null,
  })
})

test('ordinary text is not held', () => {
  assert.deepEqual(splitPasteTail('abc['), { head: 'abc[', tail: null })
})
