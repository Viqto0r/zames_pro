import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIGHT_PALETTES } from '../src/theme-light.ts'
import { ALL_PALETTES, themeNames, isThemeName } from '../src/theme.ts'

// src/theme-light.ts owns the LIGHT palettes; src/theme.ts merges them into
// ALL_PALETTES. A light palette with a missing role renders `undefined` as a
// chalk color (silently invisible text), and a palette the merge forgot is
// unreachable from /config, so both are pinned here.

const ROLES = [
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

const LIGHT_IDS = [
  'one-light',
  'github-light',
  'solarized-light',
  'gruvbox-light',
  'ayu-light',
]

test('the light palettes are exactly the five advertised ids', () => {
  assert.deepEqual(Object.keys(LIGHT_PALETTES).sort(), [...LIGHT_IDS].sort())
})

test('every light palette defines every role as a hex color', () => {
  for (const [id, palette] of Object.entries(LIGHT_PALETTES)) {
    for (const role of ROLES) {
      assert.match(
        palette[role],
        /^#[0-9a-f]{6}$/i,
        id + ' role ' + role + ' must be a hex color',
      )
    }
    assert.equal(
      Object.keys(palette).length,
      ROLES.length,
      id + ' carries no extra role',
    )
  }
})

test('a light palette really is light: its bg is near white', () => {
  for (const [id, palette] of Object.entries(LIGHT_PALETTES)) {
    const bg = palette.bg.replace('#', '')
    const r = parseInt(bg.slice(0, 2), 16)
    const g = parseInt(bg.slice(2, 4), 16)
    const b = parseInt(bg.slice(4, 6), 16)
    assert.ok(
      (r + g + b) / 3 > 200,
      id + ' bg ' + palette.bg + ' must be a light surface',
    )
  }
})

test('every light palette is merged into ALL_PALETTES and known by name', () => {
  for (const id of LIGHT_IDS) {
    assert.equal(
      ALL_PALETTES[id as keyof typeof ALL_PALETTES],
      LIGHT_PALETTES[id],
      id + ' is merged',
    )
    assert.equal(isThemeName(id), true, id + ' is a theme name')
    assert.ok(themeNames().includes(id as never), id + ' is offered by /config')
  }
})

test('the dark palettes are not overwritten by the light merge', () => {
  const dark = themeNames().filter((n) => !LIGHT_IDS.includes(n))
  assert.ok(dark.length > 0)
  for (const id of dark) {
    assert.notEqual(ALL_PALETTES[id].bg.toLowerCase(), '#ffffff')
  }
})
