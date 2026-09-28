import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// Icons for the DeepSeek toggles: 🧠 (deep thinking) and 🌐 (smart search),
// shown before the context counter. BOTH icons are always visible so the
// states can be compared. The state is encoded STRUCTURALLY, not only by
// color (many terminals ignore ANSI color on emoji):
//   🧠   plain    -> ON
//   (🧠) bracketed -> OFF

const BRAIN = '🧠'
const GLOBE = '🌐'

test('both icons are always shown', () => {
  const e = new LineEditor()
  e.thinkingEnabled = false
  e.searchEnabled = false
  const icons = e._toggleIcons()
  assert.ok(icons.includes(BRAIN), 'brain icon must always be present')
  assert.ok(icons.includes(GLOBE), 'globe icon must always be present')
})

test('an OFF toggle is bracketed, an ON one is not', () => {
  const e = new LineEditor()
  e.thinkingEnabled = true
  e.searchEnabled = false
  const icons = e._toggleIcons()
  // ON brain: present but NOT wrapped in parentheses.
  assert.ok(icons.includes('🧠'))
  // OFF globe: wrapped in parentheses (the variation selector sits between the
  // emoji and ')', so check the leading '(' + emoji).
  assert.ok(icons.includes('(🌐'), 'the OFF globe must be bracketed')
  assert.ok(icons.includes(')'), 'the OFF globe must be bracketed')
})

test('on/off differ for the same toggle', () => {
  const on = new LineEditor()
  on.thinkingEnabled = true
  on.searchEnabled = false
  const off = new LineEditor()
  off.thinkingEnabled = false
  off.searchEnabled = false
  assert.notEqual(on._toggleIcons(), off._toggleIcons())
})

test('onToggleQuery refreshes the states before a render', () => {
  const e = new LineEditor()
  e.onToggleQuery = () => ({ deepThinking: true, webSearch: false })
  e._refreshToggles()
  assert.equal(e.thinkingEnabled, true)
  assert.equal(e.searchEnabled, false)
  e.onToggleQuery = () => ({ deepThinking: false, webSearch: true })
  e._refreshToggles()
  assert.equal(e.thinkingEnabled, false)
  assert.equal(e.searchEnabled, true)
})

test('a throwing onToggleQuery does not break the render', () => {
  const e = new LineEditor()
  e.thinkingEnabled = true
  e.onToggleQuery = () => {
    throw new Error('boom')
  }
  e._refreshToggles()
  assert.equal(e.thinkingEnabled, true)
})
