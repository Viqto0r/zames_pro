import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The full-screen header reserves exactly ONE row for the title row (plus the
// divider): FullScreenApp computes the whole panel height from HEADER_ROWS=2.
// Its `left` part is `'❯ ' + title + ' v' + version` and it was NEVER
// truncated — only the working directory was. A long title on a narrow
// terminal wrapped the row, Ink added a line the layout did not know about,
// and the top of the input panel was clipped.
//
// The guard pins the SOURCE: the title part goes through truncateToWidth.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the full-screen header truncates its title part', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'tui', 'FullScreenApp.tsx'),
    'utf-8',
  )
  assert.match(
    src,
    /truncateToWidth\(left/,
    'the header never truncates the title, so a long one wraps the row',
  )
})
