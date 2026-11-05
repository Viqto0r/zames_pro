import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The landing page shows the 29 bundled palettes as a gallery built from
// docs/_data/themes.yml. Jekyll is not run in CI, so nothing else would catch
// a theme that has a screenshot but no gallery entry (an empty tile), an entry
// pointing at a missing PNG (a broken image on the landing page), or a light
// palette not marked `light` (a dark caption on a white tile).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

interface ThemeEntry {
  id: string
  bg: string
  accent: string
  light: boolean
}

// A tiny reader for the flat list-of-maps shape themes.yml uses. A real YAML
// dependency for one file would be the tail wagging the dog, and the format is
// pinned by this test: `- id: x` starts an entry, `key: value` fills it.
function readThemes(file: string): ThemeEntry[] {
  const out: ThemeEntry[] = []
  let cur: Partial<ThemeEntry> | null = null
  for (const raw of fs.readFileSync(file, 'utf-8').split('\n')) {
    const line = raw.replace(/\s+#.*$/, '')
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const entry = /^-\s+id:\s*(\S+)\s*$/.exec(line)
    if (entry) {
      if (cur) out.push(cur as ThemeEntry)
      cur = { id: entry[1] }
      continue
    }
    const kv = /^\s+(bg|accent|light):\s*(\S+)\s*$/.exec(line)
    if (!kv || !cur) continue
    const key = kv[1] as keyof ThemeEntry
    const value = kv[2].replace(/^['"]|['"]$/g, '')
    if (key === 'light') cur.light = value === 'true'
    else (cur as Record<string, string>)[key] = value
  }
  if (cur) out.push(cur as ThemeEntry)
  return out
}

const themes = readThemes(path.join(root, 'docs/_data/themes.yml'))
const shots = fs
  .readdirSync(path.join(root, 'docs/shots'))
  .filter((f) => /^theme-.+\.png$/.test(f))
  .map((f) => f.replace(/^theme-/, '').replace(/\.png$/, ''))

// src/theme-light.ts owns which palettes are light; the site must agree with
// it or a light tile gets a dark caption (unreadable) and vice versa.
const lightSource = fs.readFileSync(
  path.join(root, 'src/theme-light.ts'),
  'utf-8',
)
const lightNames = new Set(
  [...lightSource.matchAll(/^ {2}'([a-z0-9-]+)': \{$/gm)].map((m) => m[1]),
)

test('every theme screenshot has a gallery entry', () => {
  const ids = new Set(themes.map((t) => t.id))
  for (const shot of shots) {
    assert.ok(
      ids.has(shot),
      `docs/shots/theme-${shot}.png has no entry in themes.yml`,
    )
  }
})

test('every gallery entry points at an existing screenshot', () => {
  for (const t of themes) {
    assert.ok(
      fs.existsSync(path.join(root, 'docs/shots', `theme-${t.id}.png`)),
      `themes.yml lists ${t.id} but docs/shots/theme-${t.id}.png is missing`,
    )
  }
})

test('the gallery covers the ThemeName union in src/types.ts', () => {
  const types = fs.readFileSync(path.join(root, 'src/types.ts'), 'utf-8')
  const union = types.slice(
    types.indexOf('export type ThemeName ='),
    types.indexOf('// Qwen Chat'),
  )
  const names = [...union.matchAll(/\| '([a-z0-9-]+)'/g)].map((m) => m[1])
  assert.ok(names.length >= 29, 'the ThemeName union was not parsed')
  const ids = new Set(themes.map((t) => t.id))
  for (const name of names) {
    assert.ok(ids.has(name), `ThemeName ${name} is not in the site gallery`)
  }
})

test('the gallery matches the light-palette registry', () => {
  for (const t of themes) {
    assert.equal(
      t.light,
      lightNames.has(t.id),
      `${t.id}: light=${t.light} in themes.yml but src/theme-light.ts says ${lightNames.has(t.id)}`,
    )
  }
})

test('every tile declares the palette colors it paints itself with', () => {
  for (const t of themes) {
    for (const key of ['bg', 'accent'] as const) {
      assert.match(
        t[key],
        /^#[0-9a-f]{6}$/,
        `${t.id}: ${key} must be a #rrggbb color, got ${t[key]}`,
      )
    }
  }
})

test('the gallery lives on its own page, not above every page content', () => {
  const layout = fs.readFileSync(
    path.join(root, 'docs/_layouts/default.html'),
    'utf-8',
  )
  // 29 screenshots above <main> hid the landing hero and pushed the first
  // heading of every doc page below the fold, so the include is OPT-IN now.
  assert.ok(
    layout.includes('{% if page.theme_gallery %}'),
    'the gallery is no longer gated by page.theme_gallery',
  )
  assert.ok(layout.includes('id="theme-lightbox"'), 'the lightbox disappeared')
  assert.ok(layout.includes('/assets/site.js'), 'site.js is not loaded')
  for (const page of ['docs/themes.md', 'docs/themes-ru.md']) {
    const text = fs.readFileSync(path.join(root, page), 'utf-8')
    assert.match(text, /^theme_gallery: true$/m, `${page}: no gallery flag`)
  }
  for (const page of ['docs/index.md', 'docs/ru/index.md']) {
    const text = fs.readFileSync(path.join(root, page), 'utf-8')
    assert.ok(
      !text.includes('theme_gallery: true'),
      `${page}: the gallery must stay off the landing page`,
    )
  }
  const include = fs.readFileSync(
    path.join(root, 'docs/_includes/theme-gallery.html'),
    'utf-8',
  )
  // A gallery that eagerly loads 29 screenshots makes a page slow on a phone;
  // lazy loading is the whole point of the grid being cheap.
  assert.ok(include.includes('loading="lazy"'), 'the tiles lost lazy loading')
  assert.ok(
    include.includes('id="themes"'),
    'the gallery lost its #themes anchor (the header links to it)',
  )
  assert.ok(
    include.includes('class="theme-toggle"') && include.includes('hidden'),
    'the gallery toggle is missing or no longer starts hidden',
  )
  assert.ok(
    include.includes('id="theme-gallery"'),
    'the grid lost the id the toggle points its aria-controls at',
  )
  const js = fs.readFileSync(path.join(root, 'docs/assets/site.js'), 'utf-8')
  assert.ok(
    js.includes("'is-collapsed'"),
    'site.js no longer collapses the gallery',
  )
  const css = fs.readFileSync(path.join(root, 'docs/assets/site.css'), 'utf-8')
  assert.ok(
    css.includes('.theme-gallery.is-collapsed'),
    'the closed gallery state lost its CSS',
  )
})

// The landing page plays a rendered demo reel (scripts/render-demo-reel.mts):
// a missing frame or a reel.json that disagrees with the files would leave a
// blank hero, which no other test would notice.
test('the demo reel is complete and in sync', () => {
  const dir = path.join(root, 'docs/demo-reel')
  const meta = JSON.parse(
    fs.readFileSync(path.join(dir, 'reel.json'), 'utf-8'),
  ) as {
    width: number
    height: number
    frames: Array<{ src: string; delay: number }>
  }
  assert.ok(meta.frames.length > 10, 'the reel lost its frames')
  for (const f of meta.frames) {
    assert.ok(f.delay > 0, `${f.src}: a frame needs a positive delay`)
    assert.ok(
      fs.existsSync(path.join(dir, f.src)),
      `${f.src} is listed in reel.json but missing on disk`,
    )
  }
  const index = fs.readFileSync(path.join(root, 'docs/index.md'), 'utf-8')
  assert.ok(
    index.includes('data-demo-reel'),
    'the landing page stopped loading the demo reel',
  )
  assert.ok(
    fs.existsSync(path.join(root, 'docs/demo.png')),
    'the still fallback frame is gone',
  )
  // The hero <img> must declare the REAL reel size: the browser reserves the
  // space from these numbers, and a wrong pair makes the page jump when the
  // first frame swaps in.
  assert.ok(
    index.includes('width="' + meta.width + '"'),
    'the hero image width does not match the reel',
  )
})
