import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UI, uiColorsFrom, syncUiColors } from '../src/tui/ui-colors.ts'
import { ALL_PALETTES, DEFAULT_THEME, isThemeName } from '../src/theme.ts'

// uiColorsFrom() maps the 14 TUI roles onto a palette, and syncUiColors()
// MUTATES the shared `UI` object in place (every Ink widget captured that
// import at load time). A missing role shows up as `undefined` in chalk.hex()
// — invisible text — so the mapping is pinned role by role.

test('every UI role is filled from the palette and is a hex colour', () => {
  for (const name of Object.keys(ALL_PALETTES) as Array<
    keyof typeof ALL_PALETTES
  >) {
    const colors = uiColorsFrom(ALL_PALETTES[name])
    for (const [role, value] of Object.entries(colors)) {
      assert.equal(typeof value, 'string', name + '.' + role)
      assert.match(value, /^#[0-9a-f]{6}$/i, name + '.' + role + ' = ' + value)
    }
  }
})

test('the roles map onto their documented palette entries', () => {
  const p = ALL_PALETTES[DEFAULT_THEME]
  const c = uiColorsFrom(p)
  assert.equal(c.accent, p.prompt)
  assert.equal(c.text, p.assistant)
  assert.equal(c.border, p.turnRule)
  assert.equal(c.on, p.toggleOn)
  assert.equal(c.off, p.dim)
  assert.equal(c.ok, p.success)
  assert.equal(c.err, p.error)
  assert.equal(c.userBar, p.userBar)
  assert.equal(c.user, p.user)
})

test('syncUiColors mutates the SAME UI object and returns the theme id', () => {
  const before = UI
  const id = syncUiColors('zames')
  assert.equal(id, 'zames')
  assert.equal(UI, before)
  assert.equal(UI.accent, ALL_PALETTES['zames'].prompt)
})

test('an unknown theme name falls back to the default palette', () => {
  assert.equal(syncUiColors('no-such-theme'), DEFAULT_THEME)
  assert.equal(syncUiColors(undefined), DEFAULT_THEME)
  assert.equal(UI.accent, ALL_PALETTES[DEFAULT_THEME].prompt)
})
