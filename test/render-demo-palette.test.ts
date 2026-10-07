import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// scripts/render-demo.mjs mirrors the terminal palette by hand (it renders the
// README screenshot). When src/theme.ts changes, the image would silently drift
// from the real UI. This test pins the two together: every color the generator
// duplicates must still match the theme hex.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const themeSrc = fs.readFileSync(path.join(root, 'src', 'theme.ts'), 'utf-8')
const demoPath = path.join(root, 'scripts', 'render-demo.mjs')

// theme.ts: `key: chalk.hex('#rrggbb')`
function themeHexes(): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /^\s{2}(\w+):\s*chalk\.hex\('(#[0-9a-fA-F]{6})'\)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(themeSrc))) out[m[1]] = m[2].toLowerCase()
  return out
}

// render-demo.mjs: the `const C = { key: '#rrggbb', ... }` object.
function demoHexes(): Record<string, string> {
  const src = fs.readFileSync(demoPath, 'utf-8')
  const body = src.match(/const C = \{([\s\S]*?)\n\}/)
  assert.ok(body, 'render-demo.mjs no longer defines a `const C = { … }` palette')
  const out: Record<string, string> = {}
  const re = /(\w+):\s*'(#[0-9a-fA-F]{6})'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body[1]))) out[m[1]] = m[2].toLowerCase()
  return out
}

test('render-demo palette matches theme.ts hex colors', () => {
  const theme = themeHexes()
  const demo = demoHexes()
  assert.ok(Object.keys(demo).length >= 8, 'demo palette looks suspiciously small')
  for (const [key, hex] of Object.entries(demo)) {
    // `bg` is the terminal background, not a theme.ts role.
    if (key === 'bg') continue
    assert.ok(theme[key], `theme.ts has no role "${key}" used by render-demo.mjs`)
    assert.equal(hex, theme[key], `render-demo color "${key}" drifted from theme.ts`)
  }
})
