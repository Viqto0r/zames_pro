import { test } from 'node:test'
import assert from 'node:assert/strict'
import { themeNames, ALL_PALETTES } from '../src/theme.ts'
import { SLASH_COMMANDS } from '../src/commands.ts'
import { CATALOG } from '../src/i18n.ts'

// /theme is the direct entry point for the palette (the /config menu row stays
// as the settings-style path). These checks keep the two in sync: the command
// exists in the «/» hints, its help text is localized, and the picker offers
// exactly the shipped palettes with `zames` first.

test('/theme is advertised in the slash-command table', () => {
  const entry = SLASH_COMMANDS.find((c) => c.name === '/theme')
  assert.ok(entry, '/theme is missing from SLASH_COMMANDS')
  assert.ok(CATALOG[entry.key], `no catalog entry for ${entry.key}`)
})

test('the picker order matches the palette table with zames first', () => {
  const names = themeNames()
  assert.equal(names[0], 'zames')
  assert.deepEqual(names, Object.keys(ALL_PALETTES))
  assert.ok(names.includes('dracula'))
  assert.ok(names.length >= 29)
})

test('every theme name is a lowercase id safe to persist', () => {
  for (const name of themeNames()) {
    assert.match(name, /^[a-z][a-z0-9-]*$/, `bad palette id "${name}"`)
  }
})
