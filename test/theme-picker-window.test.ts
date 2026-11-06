import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The theme picker renders EVERY palette id, then a divider, the live preview
// (8 rows) and the hint bar. With ~29 bundled palettes the box needs ~41 rows —
// far more than a normal 24-row terminal. Ink clips the overflow, so the title
// and the first palettes scroll off the screen and the cursor can sit on an
// invisible row.
//
// The guard pins the SOURCE: the rendered list must be a WINDOWED slice.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the theme picker slices the palette list around the cursor', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'tui', 'ThemePicker.tsx'),
    'utf-8',
  )
  assert.match(
    src,
    /themes\.slice\(/,
    'the picker renders the whole palette list (no windowed slice)',
  )
})
