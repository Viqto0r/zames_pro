import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'
import { theme } from '../src/theme.ts'

// Icons for the DeepSeek toggles: 🧠 (deep thinking) and 🌐 (smart search),
// shown before the context counter. BOTH icons are ALWAYS shown so the state
// is visible even when the agent is idle: enabled = teal-green
// (theme.toggleOn), disabled = dim gray (theme.toggleOff). Colors are not
// changed here — only the disabled icon is now rendered instead of hidden.

function withColorSpy(fn: () => void): { on: string[]; off: string[] } {
  const on: string[] = []
  const off: string[] = []
  const origOn = theme.toggleOn
  const origOff = theme.toggleOff
  theme.toggleOn = ((s: string) => {
    on.push(s)
    return s
  }) as typeof theme.toggleOn
  theme.toggleOff = ((s: string) => {
    off.push(s)
    return s
  }) as typeof theme.toggleOff
  try {
    fn()
  } finally {
    theme.toggleOn = origOn
    theme.toggleOff = origOff
  }
  return { on, off }
}

test('both icons are shown; the disabled one uses the OFF formatter', () => {
  const e = new LineEditor()
  e.thinkingEnabled = true
  e.searchEnabled = false
  const { on, off } = withColorSpy(() => {
    const icons = e._toggleIcons()
    assert.ok(icons.includes('🧠'), 'the brain must be shown')
    assert.ok(icons.includes('🌐'), 'the globe must be shown even when off')
  })
  assert.deepEqual(
    on,
    ['🧠\uFE0E'],
    'only the ON brain uses the green formatter',
  )
  assert.deepEqual(off, ['🌐\uFE0E'], 'the OFF globe uses the dim formatter')
})

test('both icons are shown when both toggles are on', () => {
  const e = new LineEditor()
  e.thinkingEnabled = true
  e.searchEnabled = true
  const { on, off } = withColorSpy(() => {
    const icons = e._toggleIcons()
    assert.ok(icons.includes('🧠'))
    assert.ok(icons.includes('🌐'))
  })
  assert.equal(on.length, 2, 'both icons must use the green (ON) formatter')
  assert.equal(off.length, 0, 'nothing uses the OFF formatter')
})

test('both icons are shown (dim) when both toggles are off', () => {
  const e = new LineEditor()
  e.thinkingEnabled = false
  e.searchEnabled = false
  const icons = e._toggleIcons()
  assert.ok(icons.includes('🧠'), 'brain still shown')
  assert.ok(icons.includes('🌐'), 'globe still shown')
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
