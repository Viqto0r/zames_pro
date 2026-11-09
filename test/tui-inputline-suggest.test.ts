import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { suggestWindow, suggestRowCount } from '../src/input/suggest.ts'
import type { SlashCommand } from '../src/input/layout.ts'

// The suggestion POPUP is drawn by InputLine inside the input box, and its
// height is what pushes the input rows (and the real caret) down. The two
// pieces of arithmetic that decide it — the visible window and the ROW count —
// live in src/input/suggest.ts and had no test of their own: an off-by-one in
// the row count made the popup overflow the reserved rows and the caret drift.

const cmds: SlashCommand[] = Array.from({ length: 20 }, (_, i) => ({
  name: 'cmd' + i,
  description: 'd' + i,
  hint: '',
})) as SlashCommand[]

// A minimal stand-in for the layout helper the popup height is based on: a
// single-line entry per suggestion (the real one wraps, which the WIDTH case
// below drives through `suggestRowCount`).
test('the window shows one page from the offset and reports the rest', () => {
  const first = suggestWindow(cmds.slice(0, 3), 0)
  assert.equal(first.shown.length, 3)
  assert.equal(first.moreCount, 0)
  const many = suggestWindow(cmds, 0)
  assert.ok(many.shown.length > 0 && many.shown.length < cmds.length)
  assert.equal(many.moreCount, cmds.length - many.shown.length)
  const later = suggestWindow(cmds, 5)
  assert.equal(later.shown[0], cmds[5])
  // `moreCount` counts the matches BEFORE the window too, not only the ones
  // after it: it is the total minus what is shown.
  assert.equal(later.moreCount, cmds.length - later.shown.length)
  // The offset is CLAMPED to the last full page, so the operator always sees
  // `SUGGEST_PAGE` rows and the highlight cannot run off the window.
  const last = suggestWindow(cmds, cmds.length - 1)
  assert.equal(last.shown.length, many.shown.length)
  assert.equal(last.shown[last.shown.length - 1], cmds[cmds.length - 1])
  assert.equal(last.moreCount, cmds.length - last.shown.length)
  // A NEGATIVE offset falls back to the first page.
  assert.equal(suggestWindow(cmds, -3).shown[0], cmds[0])
  // An EMPTY list also reports its clamped offset (0).
  assert.deepEqual(suggestWindow([], 0), { shown: [], off: 0, moreCount: 0 })
})

test('the row count follows the buffer: a slash query lists its matches', () => {
  // `suggestRowCount` is the height the popup reserves. An empty (or non-slash)
  // buffer reserves NOTHING.
  assert.equal(suggestRowCount('', cmds, 80), 0)
  assert.equal(suggestRowCount('hello', cmds, 80), 0)
  // A slash query reserves at least one row per match, capped by the page.
  const rows = suggestRowCount('/', cmds, 80)
  const page = suggestWindow(cmds, 0).shown.length
  assert.ok(rows >= page && rows <= cmds.length, String(rows))
})

test('a NARROW width wraps an entry onto more rows, never fewer', () => {
  const wide = suggestRowCount('/c', cmds, 200)
  const narrow = suggestRowCount('/c', cmds, 20)
  assert.ok(narrow >= wide, 'narrow=' + narrow + ' wide=' + wide)
})

// The popup height must not be folded into `cursorTop` by BOTH the caller and
// the component: that double count put the caret inside the popup.
test('InputLine adds the popup rows to cursorTop exactly once', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const src = fs.readFileSync(
    path.join(root, 'src', 'tui', 'InputLine.tsx'),
    'utf-8',
  )
  assert.match(src, /y: \(props\.cursorTop \?\? 3\) \+ popupRows \+ cursorRow/)
  // `cursorTop` is documented as counting the rows ABOVE THE BOX (not the
  // popup), so the comment must keep saying so.
  assert.match(src, /rows above the INPUT BOX, not above the popup/i)
})
