import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The Ink SelectList shows chat/session titles VERBATIM. A title comes from the
// provider's sidebar (or a hand-edited session file), so it can carry ANSI
// escapes or an OSC-8 hyperlink: `it.label` was rendered straight into a
// <Text>, and Ink writes escape sequences through to the terminal. A title
// like `ESC]8;;http://evil BEL CLICK ESC]8;;BEL` made the whole row a clickable
// link, and `ESC[2J` could clear the screen from a chat title.
//
// The guard pins the SOURCE: SelectList must sanitize a label/detail before it
// reaches <Text>.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the select list strips escapes from a label and detail', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'tui', 'SelectList.tsx'),
    'utf-8',
  )
  assert.match(src, /stripControl\w*\(/, 'SelectList renders raw provider text')
})
