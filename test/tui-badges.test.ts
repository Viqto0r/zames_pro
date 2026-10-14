// Unit tests for the StatusBar badge width (src/tui/StatusBar.tsx) and the
// paste-expansion contract that keeps [Pasted lines#N] markers out of the
// agent's task text.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { badgeTextWidth } from '../src/tui/StatusBar.tsx'
import { initialEditState, insertPaste } from '../src/tui/edit.ts'
import { expandPastes } from '../src/input/layout.ts'
import { TuiStore } from '../src/tui/store.ts'

function state(
  overrides: Record<string, unknown>,
): Parameters<typeof badgeTextWidth>[0] {
  const s = new TuiStore()
  s.set(overrides as never)
  return s.getSnapshot()
}

test('badgeTextWidth: counts wide emoji as 2 columns', () => {
  const plain = badgeTextWidth(state({ thinkingEnabled: true }))
  const cjk = badgeTextWidth(state({ provider: '\u4e2d\u6587' }))
  // 2 wide chars = 4 columns, not 2 (the old .length under-counted).
  assert.equal(cjk, 4 + 3)
  assert.equal(plain, 3)
})

test('badgeTextWidth: context marker adds its own width', () => {
  const ok = badgeTextWidth(state({ contextText: 'ctx: 1k \u00b7 5%' }))
  const warn = badgeTextWidth(
    state({ contextText: 'ctx: 1k \u00b7 5%', contextLevel: 'warn' }),
  )
  assert.equal(warn - ok, 2) // the '\u25b2 ' marker is 2 columns
})

test('paste markers expand to the FULL text the agent must receive', () => {
  // The ordering contract: InputLine calls onSubmit BEFORE clearing pastes,
  // so the adapter can expand from the store's CURRENT paste list. Clearing
  // first sent the literal '[Pasted lines#5]' to the agent (the bug).
  const store = new TuiStore()
  const big = 'l1\nl2\nl3\nl4\nl5'
  const edit = insertPaste(initialEditState(), big)
  store.set({ edit, pastes: edit.pastes })
  const expanded = expandPastes(store.getSnapshot().pastes, edit.buf)
  assert.equal(expanded, big)
})
