import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  theme,
  applyTheme,
  currentThemeName,
  themeColors,
  isThemeName,
  themeNames,
  PALETTES,
  DEFAULT_THEME,
} from '../src/theme.ts'
import { syncUiColors, UI } from '../src/tui/ui-colors.ts'
import { CONFIG_SCHEMA, DEFAULTS } from '../src/config.ts'

// The theme is switched LIVE: `theme` (chalk formatters) and the Ink `UI` map
// are MUTATED IN PLACE, because every module captured the import once at load
// time. These tests pin that contract — a refactor that REPLACES the object
// instead of mutating it would leave the whole terminal on the old palette
// while /config reports the new one.

test('applyTheme repaints the SAME theme object (no re-import needed)', () => {
  const before = theme.user
  const after = applyTheme('dracula')
  assert.equal(after, 'dracula')
  assert.equal(currentThemeName(), 'dracula')
  assert.notEqual(theme.user, before, 'the shared object was not mutated')
  assert.equal(themeColors().user, PALETTES.dracula.user)
  // Every formatter still works after the swap.
  assert.equal(typeof theme.error('x'), 'string')
})

test('an unknown palette id falls back to the default', () => {
  assert.equal(applyTheme('no-such-theme'), DEFAULT_THEME)
  assert.equal(currentThemeName(), DEFAULT_THEME)
  assert.equal(applyTheme(undefined), DEFAULT_THEME)
  assert.equal(applyTheme(42), DEFAULT_THEME)
})

test('isThemeName accepts only shipped palettes', () => {
  for (const name of themeNames()) assert.ok(isThemeName(name))
  assert.ok(!isThemeName('dracula '))
  assert.ok(!isThemeName('__proto__'))
  assert.ok(!isThemeName('constructor'))
  assert.ok(!isThemeName(null))
})

test('syncUiColors derives the Ink map and mutates it in place', () => {
  applyTheme('nord')
  syncUiColors('nord')
  assert.equal(UI.accent, PALETTES.nord.prompt)
  assert.equal(UI.text, PALETTES.nord.assistant)
  assert.equal(UI.err, PALETTES.nord.error)
  const accent = UI.accent
  syncUiColors('gruvbox')
  assert.notEqual(UI.accent, accent)
  assert.equal(UI.accent, PALETTES.gruvbox.prompt)
  applyTheme(DEFAULT_THEME)
  syncUiColors(DEFAULT_THEME)
})

test('ui.theme is offered by /config with the default zames first', () => {
  const field = CONFIG_SCHEMA.find((f) => f.path === 'ui.theme')
  assert.ok(field, 'ui.theme is not in CONFIG_SCHEMA')
  assert.equal(field.type, 'enum')
  assert.deepEqual(field.values, themeNames())
  assert.equal(field.values?.[0], 'zames')
  assert.equal(DEFAULTS.ui.theme, 'zames')
})
