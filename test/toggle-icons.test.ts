import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'
import { theme } from '../src/theme.ts'

// Two colored icons before the context counter show the DeepSeek toggles:
// 🧠 "Deep thinking" and 🌐 "Smart search". A dim gray icon means off, a
// teal-green icon means on. The exact ANSI codes depend on whether the test
// process has a TTY, so we assert on the COLOR ROLE (which formatter was used),
// not on raw escape sequences.

function withColorSpies(fn: () => void): { on: string[]; off: string[] } {
  const on: string[] = []
  const off: string[] = []
  const origOn = theme.toggleOn
  const origOff = theme.toggleOff
  // Tag the calls so we can see which formatter received which icon.
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

test('icons: ON uses the green formatter, OFF uses the dim one', () => {
  const e = new LineEditor()
  e.thinkingEnabled = true
  e.searchEnabled = false
  const { on, off } = withColorSpies(() => {
    const icons = e._toggleIcons()
    assert.ok(icons.includes('🧠'), 'brain icon must be present')
    assert.ok(icons.includes('🌐'), 'globe icon must be present')
  })
  assert.deepEqual(on, ['🧠'], 'the ON brain must use the green formatter')
  assert.deepEqual(off, ['🌐'], 'the OFF globe must use the dim formatter')
})

test('both icons go green when both toggles are on', () => {
  const e = new LineEditor()
  e.thinkingEnabled = true
  e.searchEnabled = true
  const { on, off } = withColorSpies(() => {
    e._toggleIcons()
  })
  assert.deepEqual(on, ['🧠', '🌐'])
  assert.deepEqual(off, [])
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
  // The previous state is kept.
  assert.equal(e.thinkingEnabled, true)
})
