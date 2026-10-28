import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// The caret COLUMN must account for every prefix cell before the input text:
// the root gutter (screenGutter), the box left border (1) and the box inner
// padding (1). Forgetting the gutter put the caret exactly 2 cells left of the
// typed text at a wide terminal — the operator's "caret does not work".

const src = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'src',
    'tui',
    'InputLine.tsx',
  ),
  'utf-8',
)

test('the caret x includes the gutter, the border and the padding', () => {
  assert.match(src, /const cursorX =/, 'cursorX is missing')
  const at = src.indexOf('const cursorX =')
  const block = src.slice(at, at + 800)
  assert.match(block, /screenGutter\(/, 'the root gutter is not counted')
  assert.match(
    block,
    /\b2\s*\+/,
    'the border + padding columns are not counted',
  )
  assert.match(block, /lay\.cursorCol/, 'the in-box column is not used')
})
