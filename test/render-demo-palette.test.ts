import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PALETTES, DEFAULT_THEME } from '../src/theme.ts'

// scripts/render-demo.mts renders the README screenshot. It used to DUPLICATE
// the palette by hand, so a theme change silently drifted the image away from
// the real UI. Now it imports the palette from src/theme.ts — this test keeps
// it that way and checks the README screenshot shows the DEFAULT theme.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const demoPath = path.join(root, 'scripts', 'render-demo.mts')

const themeSrc = fs.readFileSync(path.join(root, 'src', 'theme.ts'), 'utf-8')

// theme.ts: `key: '#rrggbb'` inside a palette literal. The FIRST palette is
// the default ('zames') and must keep the historical colors the README shows.
function paletteHexes(name: string): Record<string, string> {
  const start = themeSrc.indexOf(name + ': {')
  assert.ok(start >= 0, `palette "${name}" not found in theme.ts`)
  const body = themeSrc.slice(start, themeSrc.indexOf('\n  },', start))
  const out: Record<string, string> = {}
  const re = /(\w+):\s*'(#[0-9a-fA-F]{6})'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) out[m[1]] = m[2].toLowerCase()
  return out
}

test('the demo screenshot reads the palette from theme.ts (no hand copy)', () => {
  const src = fs.readFileSync(demoPath, 'utf-8')
  assert.ok(
    /PALETTES\[DEFAULT_THEME\]/.test(src),
    'render-demo.mts must derive its colors from PALETTES[DEFAULT_THEME]',
  )
  assert.ok(
    !/const C = \{\s*\n\s*bg: '#/.test(src),
    'render-demo.mts re-introduced a hand-copied palette',
  )
})

test('every palette defines the same roles as the default', () => {
  const def = Object.keys(PALETTES[DEFAULT_THEME]).sort()
  assert.ok(def.length >= 15, 'default palette looks suspiciously small')
  for (const [name, p] of Object.entries(PALETTES)) {
    assert.deepEqual(
      Object.keys(p).sort(),
      def,
      `palette "${name}" is missing (or adds) a role`,
    )
    for (const [role, hex] of Object.entries(p)) {
      assert.match(
        hex,
        /^#[0-9a-fA-F]{6}$/,
        `palette "${name}" role "${role}" is not a #rrggbb color`,
      )
    }
  }
})

test('the default palette still has its historical colors', () => {
  // Pinned so a "cosmetic" edit of the default theme is a visible decision:
  // the README screenshot and every existing operator's terminal use these.
  const zames = paletteHexes('zames')
  assert.equal(zames.user, '#8fd4f0')
  assert.equal(zames.prompt, '#c8b06a')
  assert.equal(zames.assistant, '#cfc9b0')
  assert.equal(zames.system, '#808896')
  assert.equal(zames.error, '#c98a80')
  assert.equal(zames.success, '#a9c08c')
})
