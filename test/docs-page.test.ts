import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDocsPages } from '../scripts/build-readme.mts'

// The GitHub Pages site (docs/) is a user-visible surface, but nothing renders
// it in CI: a broken layout, a dead internal link or a page without front
// matter would only show up after a push. These tests pin the contract between
// the generated README pages and the Jekyll sources.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}

function frontMatter(text: string): Record<string, string> {
  assert.ok(text.startsWith('---\n'), 'the page has no Jekyll front matter')
  const end = text.indexOf('\n---\n', 4)
  assert.ok(end > 0, 'unterminated front matter')
  const fm: Record<string, string> = {}
  for (const line of text.slice(4, end).split('\n')) {
    const i = line.indexOf(':')
    if (i < 0) continue
    fm[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^"|"$/g, '')
  }
  return fm
}

// Not every .md under docs/ is a PAGE: the internal notes (design notes, the
// SEO checklist, the text audit) and the two README SOURCES are repository
// documentation only. The published pages are everything else.
const NOT_A_PAGE = new Set([
  'docs/DESIGN-NOTES.md',
  'docs/SEO.md',
  'docs/TEXT-AUDIT.md',
  'docs/readme.en.md',
  'docs/readme.ru.md',
])

function markdownPages(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(path.join(root, dir), {
    withFileTypes: true,
  })) {
    const rel = dir + '/' + entry.name
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_')) continue
      out.push(...markdownPages(rel))
    } else if (entry.name.endsWith('.md') && !NOT_A_PAGE.has(rel)) {
      out.push(rel)
    }
  }
  return out
}

test('every published Markdown page has a layout', () => {
  for (const page of markdownPages('docs')) {
    const fm = frontMatter(read(page))
    assert.ok(fm.layout, `${page}: no layout in front matter`)
    assert.ok(fm.title, `${page}: no title in front matter`)
  }
})

test('the generated README pages match buildDocsPages()', () => {
  const { en, ru } = buildDocsPages(root)
  assert.equal(
    read('docs/readme/en.md'),
    en,
    'docs/readme/en.md drifted: run `npm run build:readme`',
  )
  assert.equal(
    read('docs/readme/ru.md'),
    ru,
    'docs/readme/ru.md drifted: run `npm run build:readme`',
  )
})

test('the README sources stay plain README files', () => {
  for (const file of ['docs/readme.en.md', 'docs/readme.ru.md']) {
    const text = read(file)
    assert.ok(
      text.includes('<!-- SWITCHER -->'),
      `${file}: the SWITCHER marker is what buildReadmes/buildLlms rely on`,
    )
    assert.ok(
      !text.startsWith('---\n'),
      `${file}: front matter belongs to the generated docs/readme/*.md page`,
    )
  }
})

test('the layouts exist and are wired into the config', () => {
  for (const layout of ['default', 'doc']) {
    const html = read(`docs/_layouts/${layout}.html`)
    assert.ok(
      html.includes('<main>') || html.includes('layout: default'),
      `${layout}: neither a <main> nor the default layout chain`,
    )
  }
  const base = read('docs/_layouts/default.html')
  assert.ok(base.includes('<main>'), 'default: no <main>')
  assert.ok(base.includes('site.css'), 'default: the stylesheet is not linked')
  const config = read('docs/_config.yml')
  // `theme: null` matters: a Jekyll theme would inject its own layout and
  // silently win over docs/_layouts, undoing the redesign.
  assert.match(config, /^theme: null$/m)
  assert.match(config, /^ {2}- jekyll-sitemap$/m)
})

test('the landing pages are bilingual and cross-linked', () => {
  const en = frontMatter(read('docs/index.md'))
  const ru = frontMatter(read('docs/ru/index.md'))
  assert.equal(en.lang, 'en')
  assert.equal(ru.lang, 'ru')
  assert.equal(en.alt_url, '/ru/')
  assert.equal(ru.alt_url, '/')
  for (const anchor of ['features', 'how-it-works', 'providers', 'install']) {
    assert.ok(
      read('docs/index.md').includes('id="' + anchor + '"'),
      `the landing page lost the #${anchor} section`,
    )
  }
})

test('the paired doc pages point at each other', () => {
  const pairs: Array<[string, string, string]> = [
    ['docs/commands.md', 'docs/commands-ru.md', '/commands'],
    ['docs/configuration.md', 'docs/configuration-ru.md', '/configuration'],
    ['docs/mcp.md', 'docs/mcp-ru.md', '/mcp'],
    [
      'docs/troubleshooting.md',
      'docs/troubleshooting-ru.md',
      '/troubleshooting',
    ],
  ]
  for (const [enFile, ruFile, enPath] of pairs) {
    const en = frontMatter(read(enFile))
    const ru = frontMatter(read(ruFile))
    assert.equal(en.lang, 'en', enFile)
    assert.equal(ru.lang, 'ru', ruFile)
    assert.equal(en.alt_url, enPath + '-ru.html', enFile)
    assert.equal(ru.alt_url, enPath + '.html', ruFile)
  }
})

test('the landing page links only to pages that exist', () => {
  const html = read('docs/index.md') + read('docs/ru/index.md')
  // `{{ '/path' | relative_url }}` -> check the target page exists in docs/.
  const re = /\{\{ '\/([^'#]+)' \| relative_url \}\}/g
  for (const m of html.matchAll(re)) {
    const target = m[1].replace(/\/$/, '')
    if (target === '') continue
    const candidates = [
      path.join(root, 'docs', target + '.md'),
      path.join(root, 'docs', target, 'index.md'),
      path.join(root, 'docs', target),
    ]
    assert.ok(
      candidates.some((p) => fs.existsSync(p)),
      `the landing page links ${m[0]} but docs/${target} does not exist`,
    )
  }
})

test('robots.txt points at the sitemap of the real site', () => {
  const robots = read('docs/robots.txt')
  assert.ok(robots.includes('https://viqto0r.github.io/zames_pro/sitemap.xml'))
  assert.match(robots, /^User-agent: \*$/m)
  assert.match(robots, /^Allow: \/$/m)
})

// A generated README page must not link into the repository layout
// (docs/*.md, LICENSE, CONTRIBUTING.md) — those paths do not exist on the
// site and would 404 for a visitor.
test('the generated README pages have no repository-only links', () => {
  for (const file of ['docs/readme/en.md', 'docs/readme/ru.md']) {
    const text = read(file)
    for (const bad of [
      '](docs/',
      '](LICENSE)',
      '](CONTRIBUTING.md)',
      '](SECURITY.md)',
      '](CODE_OF_CONDUCT.md)',
      '](CHANGELOG.md)',
    ]) {
      assert.ok(!text.includes(bad), `${file}: repository-only link ${bad}`)
    }
  }
})

// The doc layout builds a per-language navigation: a Russian page must not
// link an English neighbour (and vice versa), otherwise a RU reader is thrown
// into English documentation and the `alt_url` switch looks broken.
test('the doc navigation stays in the page language', () => {
  const layout = read('docs/_layouts/doc.html')
  const ru = layout.slice(layout.indexOf("page.lang == 'ru'"))
  for (const path of [
    '/commands-ru',
    '/mcp-ru',
    '/configuration-ru',
    '/troubleshooting-ru',
    '/readme/ru',
  ]) {
    assert.ok(layout.includes(path), `the doc nav lost ${path}`)
  }
  assert.ok(ru.length > 0, 'the RU branch of the doc nav is missing')
})

// The site is served from /zames_pro/ (a GitHub Pages PROJECT site), so every
// URL the layout emits must carry that baseurl: a root-absolute link would
// land on https://viqto0r.github.io/404.html.
test('the site declares its baseurl and the layout uses it', () => {
  const config = read('docs/_config.yml')
  assert.match(config, /^baseurl: \/zames_pro$/m)
  assert.match(config, /^url: https:\/\/viqto0r\.github\.io$/m)
  const layout = read('docs/_layouts/default.html')
  assert.ok(
    layout.includes('{{ page.url | absolute_url }}'),
    'the canonical/og:url must go through absolute_url (it adds the baseurl)',
  )
  assert.ok(
    !layout.includes('viqto0r.github.io{{ page.url }}'),
    'a hardcoded host without the baseurl sends crawlers to a 404',
  )
})

// A missing stylesheet is invisible to every other check: Jekyll happily
// publishes an unstyled page. Pin the assets the layout references.
test('the layout assets exist', () => {
  const layout = read('docs/_layouts/default.html')
  for (const asset of ['/assets/site.css', '/assets/favicon.svg']) {
    assert.ok(layout.includes(asset), `the layout lost ${asset}`)
    assert.ok(
      fs.existsSync(path.join(root, 'docs', asset.replace(/^\//, ''))),
      `${asset} is referenced but does not exist`,
    )
  }
})
