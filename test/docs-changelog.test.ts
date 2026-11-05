import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildChangelogPages,
  parseChangelog,
} from '../scripts/build-changelog.mts'
import { buildSiteData, SITE_UI_PATH } from '../scripts/build-site-data.mts'
import { SITE_UI } from '../scripts/site-ui.mts'

// The changelog page and the generated site data are both copied FROM
// CHANGELOG.md / site-ui.mts into docs/, so a release (which rewrites
// CHANGELOG.md) or a translation edit can leave them stale without anything
// failing: GitHub Pages would serve last release's history. These tests pin the
// drift, exactly like test/readme-built.test.ts does for README.md.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

test('the changelog pages match CHANGELOG.md', () => {
  const { en, ru } = buildChangelogPages(root)
  assert.equal(
    read('docs/changelog.md'),
    en,
    'docs/changelog.md drifted: run `npm run build:changelog`',
  )
  assert.equal(
    read('docs/changelog-ru.md'),
    ru,
    'docs/changelog-ru.md drifted: run `npm run build:changelog`',
  )
})

test('the generated site data matches site-ui.mts', () => {
  assert.equal(
    read(SITE_UI_PATH),
    buildSiteData(),
    `${SITE_UI_PATH} drifted: run \`npm run build:site-data\``,
  )
})

// Every release of CHANGELOG.md must reach the page: a parser that silently
// skips a heading would hide the release from every visitor while the file
// itself looks fine.
test('every CHANGELOG.md release is on the page', () => {
  const releases = parseChangelog(read('CHANGELOG.md'))
  assert.ok(releases.length > 100, `only ${releases.length} releases parsed`)
  const page = read('docs/changelog.md')
  for (const rel of releases) {
    assert.ok(
      page.includes('id="v' + rel.version + '"'),
      `release ${rel.version} is missing from the page`,
    )
    if (rel.date)
      assert.ok(
        page.includes('datetime="' + rel.date + '"'),
        `release ${rel.version} lost its date`,
      )
  }
})

// The jump list is the only way to reach an old version without scrolling 294
// folded sections, so every entry must point at an id the page actually has.
test('the jump list points at existing releases only', () => {
  const page = read('docs/changelog.md')
  const nav = /<nav class="changelog-jump"[^>]*>([\s\S]*?)<\/nav>/.exec(page)
  assert.ok(nav, 'the jump list is gone')
  const targets = [...nav[1].matchAll(/href="#([^"]+)"/g)].map((m) => m[1])
  assert.ok(targets.length > 100, `only ${targets.length} jump targets`)
  for (const id of targets) {
    assert.ok(
      page.includes('id="' + id + '"'),
      `jump target ${id} does not exist`,
    )
  }
})

// A release group heading is translated, but an UNKNOWN group must not vanish
// from the Russian page: a release note is data, not a label.
test('the Russian changelog keeps every release group', () => {
  const en = read('docs/changelog.md')
  const ru = read('docs/changelog-ru.md')
  const count = (text: string) =>
    (text.match(/<section class="ch-group">/g) || []).length
  assert.equal(count(ru), count(en), 'the RU page lost a release group')
})

// The doc nav and the landing grid are generated from site-ui.mts, so a page
// that exists in only one language is a table typo — pin the shape.
test('site-ui.mts describes every page in both languages', () => {
  for (const locale of ['en', 'ru'] as const) {
    const ui = SITE_UI[locale]
    assert.ok(ui.changelog.title, `${locale}: no changelog title`)
    assert.ok(ui.docsNav.changelog, `${locale}: no changelog nav label`)
    const hrefs = ui.landing.cards.map((c) => c[0])
    assert.ok(
      hrefs.includes(locale === 'ru' ? '/changelog-ru' : '/changelog'),
      `${locale}: the landing page does not link the changelog`,
    )
    for (const card of ui.landing.cards) {
      assert.equal(
        card.length,
        3,
        `${locale}: a card is not [href, title, text]`,
      )
      assert.ok(card[1] && card[2], `${locale}: an empty card for ${card[0]}`)
    }
  }
})

// A card links a PAGE, so its target must exist in docs/ (the same rule the
// landing-page link test applies to hand-written cards).
test('every landing card links a page that exists', () => {
  for (const locale of ['en', 'ru'] as const) {
    for (const [href] of SITE_UI[locale].landing.cards) {
      const target = href.replace(/^\//, '')
      if (target === '') continue
      const candidates = [
        path.join(root, 'docs', target + '.md'),
        path.join(root, 'docs', target, 'index.md'),
      ]
      assert.ok(
        candidates.some((p) => fs.existsSync(p)),
        `${locale}: the card links ${href} but docs/${target} does not exist`,
      )
    }
  }
})

// Both changelog pages must be real Jekyll pages of the doc layout, cross-linked
// by hreflang — a missing alt_url sends Google to the English page for a RU
// search and hides the translation.
test('the changelog pages are paired and laid out', () => {
  const en = read('docs/changelog.md')
  const ru = read('docs/changelog-ru.md')
  assert.match(en, /^layout: doc$/m)
  assert.match(ru, /^layout: doc$/m)
  assert.match(en, /^lang: en$/m)
  assert.match(ru, /^lang: ru$/m)
  assert.match(en, /^alt_url: \/changelog-ru\.html$/m)
  assert.match(ru, /^alt_url: \/changelog\.html$/m)
  assert.match(en, /^title: "Changelog"$/m)
  assert.match(ru, /^title: "История изменений"$/m)
})
