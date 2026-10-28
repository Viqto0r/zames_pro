// Ctrl+R reverse search: after `searchNext` walked BACK to an older entry, the
// displayed match may no longer contain the query (a legacy quirk the operator
// lives with). Erasing the query back to an EMPTY string must then re-search
// from that same position, not from the newest entry: re-searching from the
// bottom JUMPED FORWARD, so the operator saw the match bounce around instead of
// staying where they were browsing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialEditState,
  recordHistory,
  searchStart,
  searchInput,
  searchNext,
  searchBackspace,
  searchCancel,
  type EditState,
} from '../src/tui/edit.ts'

function withHistory(): EditState {
  let s = initialEditState()
  s = recordHistory(s, 'alpha one')
  s = recordHistory(s, 'beta two')
  s = recordHistory(s, 'alpha three')
  return s
}

test('erasing the query keeps the CURRENT match position', () => {
  let s = withHistory()
  s = searchStart(s)
  s = searchInput(s, 'a')
  s = searchNext(s)
  assert.equal(s.searchIndex, 1)
  s = searchBackspace(s)
  assert.equal(
    s.searchIndex,
    1,
    'the search must not jump forward past the current match',
  )
})

test('refining a matching query stays on the same entry', () => {
  let s = withHistory()
  s = searchStart(s)
  s = searchInput(s, 'alpha three')
  assert.equal(s.searchIndex, 2)
  s = searchBackspace(s)
  assert.equal(s.searchIndex, 2)
})

test('cancel restores the draft', () => {
  let s = withHistory()
  s = { ...s, buf: 'my draft', cursor: 8, histDraft: 'my draft' }
  s = searchStart(s)
  s = searchInput(s, 'beta')
  assert.equal(s.searchIndex, 1)
  s = searchCancel(s)
  assert.equal(s.buf, 'my draft')
})
