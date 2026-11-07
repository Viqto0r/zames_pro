import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PALETTES,
  ALL_PALETTES,
  DEFAULT_THEME,
  isThemeName,
  themeNames,
  currentThemeName,
  applyTheme,
  themeColors,
  theme,
} from '../src/theme.ts'

// src/theme.ts is the palette registry plus the live chalk formatter object.
// The live-switch mechanics have their own files (theme-switch, markdown-theme,
// theme-divider); this one pins the REGISTRY contract every caller relies on:
// what counts as a known name, the default, and the raw hex map.

test('the default palette is zames and it is a known name', () => {
  assert.equal(DEFAULT_THEME, 'zames')
  assert.equal(isThemeName(DEFAULT_THEME), true)
})

test('isThemeName accepts only a shipped id', () => {
  assert.equal(isThemeName('dracula'), true)
  assert.equal(isThemeName('one-light'), true)
  assert.equal(isThemeName('no-such-theme'), false)
  assert.equal(isThemeName(''), false)
  assert.equal(isThemeName(undefined), false)
  assert.equal(isThemeName(null), false)
  assert.equal(isThemeName(42), false)
})

test('an inherited Object key is NOT a theme name', () => {
  assert.equal(isThemeName('toString'), false)
  assert.equal(isThemeName('constructor'), false)
  assert.equal(isThemeName('__proto__'), false)
})

test('themeNames lists every palette and starts with zames', () => {
  const names = themeNames()
  assert.equal(names[0], 'zames')
  assert.deepEqual(names, Object.keys(ALL_PALETTES))
  // The dark table is a subset of the merged one.
  for (const k of Object.keys(PALETTES)) assert.ok(names.includes(k as never))
})

test('every palette defines all the roles with hex colors', () => {
  const roles = [
    'bg',
    'user',
    'userBar',
    'turnRule',
    'turnLabel',
    'prompt',
    'dir',
    'assistant',
    'tool',
    'toolResult',
    'system',
    'dim',
    'taskSummary',
    'warn',
    'error',
    'success',
    'brown',
    'toggleOn',
  ]
  for (const name of themeNames()) {
    const p = ALL_PALETTES[name]
    for (const role of roles) {
      assert.match(p[role], /^#[0-9a-f]{6}$/i, name + ' / ' + role)
    }
  }
})

test('applyTheme returns the applied name and falls back on an unknown id', () => {
  try {
    assert.equal(applyTheme('nord'), 'nord')
    assert.equal(currentThemeName(), 'nord')
    // An unknown id must never blank the colors: it falls back to the default.
    assert.equal(applyTheme('no-such-theme'), DEFAULT_THEME)
    assert.equal(currentThemeName(), DEFAULT_THEME)
    assert.equal(applyTheme(undefined), DEFAULT_THEME)
  } finally {
    applyTheme('zames')
  }
})

test('themeColors returns the RAW hex map of the active palette', () => {
  try {
    applyTheme('dracula')
    const c = themeColors()
    assert.equal(c, ALL_PALETTES.dracula)
    assert.match(c.bg, /^#[0-9a-f]{6}$/i)
  } finally {
    applyTheme('zames')
  }
})

test('applyTheme repaints the SAME theme object in place', () => {
  // `theme` is mutated, never replaced: every module captured the import at
  // load time. The per-role KEYS are swapped, so the object identity is what
  // survives (the role values themselves are new chalk formatters).
  const obj = theme
  try {
    applyTheme('dracula')
    assert.equal(theme, obj)
    assert.equal(typeof theme.user, 'function')
    assert.equal(typeof theme.bold, 'function')
    assert.equal(Object.keys(theme).includes('user'), true)
  } finally {
    applyTheme('zames')
  }
})
