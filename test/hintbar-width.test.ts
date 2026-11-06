import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The hint row at the bottom of every Ink modal is ONE line, but the config
// menu passes SEVEN hints (arrows, Enter, p, /, d, Esc, q). In Russian that
// line is ~111 columns; on an 80-column terminal Ink wraps it into a SECOND
// row the modal/menu layout never reserved, so the border and the input rows
// shift by one.
//
// The guard pins the SOURCE: HintBar must measure its row and clip it.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('HintBar clips its row to the available width', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'tui', 'widgets.tsx'),
    'utf-8',
  )
  const body = src.slice(src.indexOf('export function HintBar'))
  assert.match(body, /useWindowSize|columns/, 'HintBar ignores the width')
  assert.match(body, /truncateToWidth|clip/, 'HintBar never clips its row')
})
