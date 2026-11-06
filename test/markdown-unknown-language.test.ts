import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/markdown.ts'

// A model answer may carry a code fence whose language tag the highlighter
// does not know (`kotlin-ish`, `astro`, a typo). cli-highlight THROWS for it,
// and the single try/catch around the whole render returned the answer RAW:
// the rest of the reply lost its wrapping, its theme and the code box, and a
// warning was printed to the operator — for ONE unknown tag.
const ESC = String.fromCharCode(27)
const stripSgr = (s: string): string =>
  s.replace(new RegExp(ESC + '\\[[0-9;]*m', 'g'), '')

test('an unknown code-fence language does not de-format the whole answer', () => {
  const md =
    'Intro text that should be wrapped.\n\n' +
    '```kotlin-ish-unknown\nval x = 1\n```\n\nAfter.'
  const out = renderMarkdown(md)
  assert.ok(
    !out.includes('```'),
    'the answer stayed raw: ' + JSON.stringify(out),
  )
  const plain = stripSgr(out)
  assert.ok(plain.includes('val x = 1'), JSON.stringify(out))
  assert.ok(plain.includes('After.'), JSON.stringify(out))
})

test('a known language still highlights', () => {
  const out = renderMarkdown('```js\nconst a = 1\n```')
  assert.ok(!out.includes('```'), JSON.stringify(out))
  assert.ok(stripSgr(out).includes('const a = 1'), JSON.stringify(out))
})
