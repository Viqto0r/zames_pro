import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The Ink /config menu sizes its windowed list with `maxRows = termRows - 8`:
// the chrome (border, title, divider, hint bar, margins) is 8 rows. Toggling
// the inline THEME PREVIEW ('p' on the ui.theme row) adds a title plus the six
// compact preview lines — SEVEN more rows the budget did not know about, so on
// a 24-row terminal the block needed 16 + 8 + 7 = 31 rows and the top of the
// menu scrolled off the screen.
//
// The guard pins the SOURCE: the budget must subtract the preview height.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the menu budget shrinks while the theme preview is open', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'tui', 'ConfigMenu.tsx'),
    'utf-8',
  )
  assert.match(
    src,
    /termRows\s*-\s*8\s*-\s*\(previewOpen\s*\?\s*7\s*:\s*0\)/,
    'maxRows ignores the preview rows',
  )
})
