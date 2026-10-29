// The legacy `LineEditor` has its own Ctrl+R reverse search. Like the TUI's
// `edit.ts` before its fix, `_searchInput`/`_searchBackspace` call
// `_searchRefresh(true)`, which resets the scan to the NEWEST entry. After
// `_searchNext` moved the operator to an older match, erasing one character
// re-searched from the bottom and JUMPED FORWARD — the match bounced instead of
// staying where they were browsing. The TUI was already fixed; the two engines
// must behave the same.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

function makeEditor(history: string[]): Record<string, unknown> {
  const proto = (
    LineEditor as unknown as { prototype: Record<string, unknown> }
  ).prototype
  const ed = Object.create(proto) as Record<string, unknown>
  ed.history = history
  ed._histIndex = history.length
  ed.buf = 'my draft'
  ed.cursor = 8
  ed._histDraft = 'my draft'
  ed._searchMode = false
  ed.locale = 'en'
  ed.setStatus = () => {}
  ed._render = () => {}
  ed._renderInputOnly = () => {}
  return ed
}

test('erasing the query keeps the CURRENT match position', () => {
  const ed = makeEditor(['alpha one', 'beta two', 'alpha three'])
  ;(ed as { _searchStart: () => void })._searchStart()
  ;(ed as { _searchInput: (c: string) => void })._searchInput('a')
  ;(ed as { _searchNext: () => void })._searchNext()
  assert.equal(ed._searchIndex, 1)
  ;(ed as { _searchBackspace: () => void })._searchBackspace()
  assert.equal(
    ed._searchIndex,
    1,
    'the search must not jump forward past the current match',
  )
})

test('cancel still restores the draft', () => {
  const ed = makeEditor(['alpha one', 'beta two'])
  ;(ed as { _searchStart: () => void })._searchStart()
  ;(ed as { _searchInput: (c: string) => void })._searchInput('beta')
  ;(ed as { _searchCancel: () => void })._searchCancel()
  assert.equal(ed.buf, 'my draft')
})
