import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutInput } from '../src/input/layout.ts'

// A word-wrapped row must NOT start with the space that was consumed by the
// break. The continuation row is indented by the PROMPT WIDTH only (2 for
// `❯ `), never by an extra blank cell. The operator saw exactly that: a
// wrapped line looked one space too far right, and the first row carried a
// trailing blank.

test('a wrapped row starts at the word, not at the break space', () => {
  const buf = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk'
  for (const cols of [30, 34, 38, 42, 46]) {
    const lay = layoutInput('❯ ', buf, buf.length, cols)
    for (const row of lay.rows) {
      assert.ok(
        !row.text.startsWith(' '),
        'cols=' +
          cols +
          ' row starts with a space: ' +
          JSON.stringify(row.text),
      )
      assert.ok(
        !/ $/.test(row.text),
        'cols=' + cols + ' row ends with a space: ' + JSON.stringify(row.text),
      )
    }
  }
})

test('a wrapped row keeps EXACTLY the prompt indent', () => {
  const buf = 'ф вйцв йцв йцв йцв йцва йца йцац йа цйа йца йцвв'
  const lay = layoutInput('❯ ', buf, buf.length, 42)
  assert.ok(lay.rows.length > 1, 'the sample must wrap')
  for (const row of lay.rows.slice(1)) {
    assert.equal(row.prefix, '  ', 'continuation indent = prompt width')
    assert.ok(!row.text.startsWith(' '), 'no extra blank cell')
  }
})

test('no text is lost when the break space is dropped', () => {
  const buf = 'aaaa bbbb cccc dddd eeee ffff'
  const joined = layoutInput('❯ ', buf, buf.length, 22)
    .rows.map((r) => r.text)
    .join(' ')
  assert.equal(joined.replace(/\s+/g, ' ').trim(), buf)
})
