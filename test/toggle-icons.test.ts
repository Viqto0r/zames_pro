import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'
import { theme } from '../src/theme.ts'

// Icons for the DeepSeek toggles: 🧠 (deep thinking) and 🌐 (smart search),
// shown before the context counter. Only the ENABLED toggle is shown — an
// icon present means ON, absent means OFF. This is deliberate: emoji are not
// colored by ANSI, so a "dim" vs "green" pair of the SAME emoji would look
// identical, making the state ambiguous. Hiding the OFF icon is the only
// reliable signal.

function withColorSpy(fn: () => void): string[] {
  const seen: string[] = []
  const orig = theme.toggleOn
  theme.toggleOn = ((s: string) => {
    seen.push(s)
    return s
  }) as typeof theme.toggleOn
  try {
    fn()
  } finally {
    theme.toggleOn = orig
  }
  return seen
}

test('only the enabled toggle is shown', () => {
  const e = new LineEditor()
  e.thinkingEnabled = true
  e.searchEnabled = false
  const icons = e._toggleIcons()
  assert.ok(icons.includes('🧠'), 'the ON brain must be shown')
  assert.ok(!icons.includes('🌐'), 'the OFF globe must be hidden')
})

test('both icons are shown when both toggles are on', () => {
  const e = new LineEditor()
  e.thinkingEnabled = true
  e.searchEnabled = true
  const seen = withColorSpy(() => {
    const icons = e._toggleIcons()
    assert.ok(icons.includes('🧠'))
    assert.ok(icons.includes('🌐'))
  })
  assert.equal(seen.length, 2, 'both icons must use the green (ON) formatter')
})

test('no icons when both toggles are off', () => {
  const e = new LineEditor()
  e.thinkingEnabled = false
  e.searchEnabled = false
  assert.equal(e._toggleIcons(), '')
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

test('refreshStatus repaints and picks up the new toggle state', () => {
  const e = new LineEditor()
  e._render = () => {}
  let state = { deepThinking: false, webSearch: false }
  e.onToggleQuery = () => state
  e.refreshStatus()
  assert.equal(e.thinkingEnabled, false)
  state = { deepThinking: true, webSearch: true }
  let rendered = 0
  e._render = () => {
    rendered++
    e._refreshToggles()
  }
  e.refreshStatus()
  assert.equal(rendered, 1, 'refreshStatus must repaint')
  assert.equal(e.thinkingEnabled, true)
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
