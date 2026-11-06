import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// InputLine positions the REAL terminal caret with
//   x = screenGutter + 2 + cursorCol
// The `2` is the left BORDER (1) plus the box's inner padding (1). With
// `ui.inputBorder=none` the Ink Box has NO borderStyle but keeps
// `paddingLeft={1}`, so the text starts at `gutter + 1` while the caret is
// placed at `gutter + 2` — one cell to the RIGHT of the character being typed.
//
// The guard pins the SOURCE: the caret offset must come from the border style,
// not a hardcoded 2.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the caret column follows the border style', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'tui', 'InputLine.tsx'),
    'utf-8',
  )
  assert.doesNotMatch(
    src,
    /screenGutter\(columns \|\| 80\) \+ 2 \+/,
    'the caret offset is still the hardcoded 2',
  )
})
