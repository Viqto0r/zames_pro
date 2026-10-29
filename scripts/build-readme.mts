// Assemble README.md from the two language sources.
//
// Why: npm renders exactly ONE readme per package (README.md in the root) and
// has no language tabs. npm renders the readme with GitHub Flavored Markdown
// (via GitHub's API), so a <details> block DOES work there -- and on GitHub
// too. We keep the English text on top and fold the Russian translation into
// a collapsible block at the bottom. The language switcher is an in-page
// `#readme-ru` anchor, so one README.md serves both languages -- there is
// no separate README.ru.md anymore (it was invisible on npm and just
// duplicated the folded block).
//
// The two sources (docs/readme.en.md, docs/readme.ru.md) are the single point
// of edit for each language; this script wires the switcher and the collapsible
// cross-language block so neither language has to be re-assembled by hand. The
// generated file is committed; test/readme-built.test.ts re-runs buildReadmes()
// and fails if it drifts from the sources.
//
// Usage:  npm run build:readme           (write README.md)
//         npm run build:readme -- --check (exit 1 when README.md drifted;
//                                         the CI step that keeps a hand-edit
//                                         of the generated file from landing)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NL = String.fromCharCode(10)

// Must match `baseurl` in docs/_config.yml: GitHub Pages serves this project
// site from /zames_pro/, not from the host root.
const SITE_BASEURL = '/zames_pro'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SWITCHER = '<!-- SWITCHER -->'

// In-page anchor the switcher links to. GitHub strips `id` on some elements but
// keeps `name` on an <a>, so both are set.
export const RU_ANCHOR = '<a id="readme-ru" name="readme-ru"></a>'

const EN_SWITCH = [
  '<p align="center">',
  '  <strong>English</strong> | <a href="#readme-ru">Русский</a>',
  '</p>',
].join(NL)

export function readSource(
  rootDir: string,
  name: string,
): { head: string; body: string } {
  const file = path.join(rootDir, 'docs', name)
  const text = fs.readFileSync(file, 'utf-8')
  const i = text.indexOf(SWITCHER)
  if (i < 0) {
    throw new Error(
      file + ' has no ' + SWITCHER + ' marker (was the marker deleted?)',
    )
  }
  return {
    // Everything above the marker: logo, title, badges.
    head: text.slice(0, i).replace(/\n+$/, ''),
    // Everything below: the actual documentation.
    body: text
      .slice(i + SWITCHER.length)
      .replace(/^\n+/, '')
      .replace(/\n+$/, ''),
  }
}

// GitHub Pages needs a page for each README. The Jekyll page is generated into
// docs/readme/en.md + docs/readme/ru.md (NOT over the sources: the sources are
// plain README files whose <!-- SWITCHER --> marker buildReadmes() and
// buildLlms() depend on). The hero head above the marker (logo + badges) is
// dropped — the site layout draws its own header — and every repository-only
// link is rewritten to a site or GitHub URL so the published page has no 404.
// test/docs-page.test.ts pins the result.
export function readmePageFrontMatter(lang: 'en' | 'ru'): string {
  const isRu = lang === 'ru'
  return [
    '---',
    'layout: doc',
    'title: ' + (isRu ? '"README — обзор"' : '"README — overview"'),
    'description: ' +
      (isRu
        ? '"Полный обзор zames_pro: быстрый старт, вход в аккаунт, провайдеры, использование, опции и FAQ."'
        : '"The full zames_pro overview: quick start, signing in, providers, usage, options and FAQ."'),
    'lang: ' + lang,
    'alt_url: ' + (isRu ? '/readme/en.html' : '/readme/ru.html'),
    '---',
    '',
  ].join(NL)
}

function details(summary: string, body: string): string {
  return [
    '<details>',
    '<summary>' + summary + '</summary>',
    '',
    body,
    '',
    '</details>',
  ].join(NL)
}

// The GitHub Pages copy of each README, ready to be written to
// docs/readme/{en,ru}.md: only the BODY below the switcher marker is taken
// (the head above it is the GitHub/npm hero — logo, badges — which the site
// layout replaces with its own header), the README's in-page language anchor is
// dropped (the layout has a real EN/RU switch), and links that only resolve
// inside the repository (docs/*.md, LICENSE, CONTRIBUTING.md, ...) are
// rewritten to site or GitHub URLs so a visitor never hits a 404.
// Returns the pages WITHOUT touching the disk, like buildReadmes().
export function buildDocsPages(rootDir: string): {
  en: string
  ru: string
} {
  const fix = (body: string): string =>
    body
      // The site is published from /zames_pro/, so a link must carry the
      // baseurl; `{{ site.baseurl }}` is NOT expanded inside a generated
      // Markdown file (it is not a Jekyll template), so the prefix is baked in
      // here and SITE_BASEURL is the single place to change it.
      .replace(/\]\(docs\/([a-z.-]+)\.md\)/g, '](' + SITE_BASEURL + '/$1.html)')
      .replace(
        /\]\((LICENSE|CONTRIBUTING\.md|SECURITY\.md|CODE_OF_CONDUCT\.md|CHANGELOG\.md)\)/g,
        (_m: string, name: string) =>
          '](https://github.com/Viqto0r/zames_pro/blob/master/' + name + ')',
      )
      .replace(/\]\(#readme-ru\)/g, '](#readme)')
      // The README centres its screenshots with <p align="center">; on the
      // site the layout already centres the figure, and a raw HTML block in
      // the middle of Markdown is where Jekyll's Markdown stops parsing.
      .replace(/<p align="center">\s*(<img[^>]*>)\s*<\/p>/g, '$1')
  // A page is generated, so it is normalised here (Prettier never runs on it:
  // docs/readme/ is not in the format:check glob, and hand-formatting a
  // generated file would just drift again on the next build).
  const tidy = (page: string): string =>
    page.replace(/\n{3,}/g, NL + NL).replace(/[ \t]+$/gm, '')
  return {
    en: tidy(
      readmePageFrontMatter('en') +
        fix(readSource(rootDir, 'readme.en.md').body) +
        NL,
    ),
    ru: tidy(
      readmePageFrontMatter('ru') +
        fix(readSource(rootDir, 'readme.ru.md').body) +
        NL,
    ),
  }
}

// Returns the generated README.md WITHOUT touching the disk, so a test can
// compare it against the committed file. Only README.md is generated: the
// Russian translation lives inside it as a <details> block, and the switcher
// is an in-page `#readme-ru` anchor.
export function buildReadmes(rootDir: string): { readmeEn: string } {
  const en = readSource(rootDir, 'readme.en.md')
  const ru = readSource(rootDir, 'readme.ru.md')
  const readmeEn = [
    en.head,
    '',
    EN_SWITCH,
    '',
    en.body,
    '',
    RU_ANCHOR,
    details('🇷🇺 Читать по-русски (Russian)', ru.body),
    '',
  ].join(NL)
  return { readmeEn }
}

// Run only when invoked directly (not when imported by a test).
const invoked =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  const { readmeEn } = buildReadmes(root)
  const target = path.join(root, 'README.md')
  if (process.argv.includes('--check')) {
    // A mismatch means someone edited the GENERATED file instead of
    // docs/readme.*.md; the next build would silently drop that edit.
    const onDisk = fs.readFileSync(target, 'utf-8')
    if (onDisk !== readmeEn) {
      console.error(
        'build-readme: README.md drifted from docs/readme.*.md — run `npm run build:readme`',
      )
      process.exit(1)
    }
    console.log('build-readme: README.md is up to date')
  } else {
    fs.writeFileSync(target, readmeEn)
    console.log('build-readme: wrote README.md')
  }

  // The GitHub Pages copy of each README. The SOURCES (docs/readme.*.md) stay
  // plain README files with the <!-- SWITCHER --> marker buildReadmes() and
  // buildLlms() depend on; the served pages live under docs/readme/ so
  // Jekyll renders them with the site layout without touching the sources.
  const pages = buildDocsPages(root)
  const pageTargets = [
    path.join(root, 'docs', 'readme', 'en.md'),
    path.join(root, 'docs', 'readme', 'ru.md'),
  ]
  fs.mkdirSync(path.join(root, 'docs', 'readme'), { recursive: true })
  if (process.argv.includes('--check')) {
    const drifted = [pageTargets[0], pageTargets[1]].filter(
      (file, i) => fs.readFileSync(file, 'utf-8') !== [pages.en, pages.ru][i],
    )
    if (drifted.length > 0) {
      console.error(
        'build-readme: ' +
          drifted.map((f) => path.basename(f)).join(', ') +
          ' drifted from docs/ — run `npm run build:readme`',
      )
      process.exit(1)
    }
    console.log('build-readme: README pages are up to date')
  } else {
    fs.writeFileSync(pageTargets[0], pages.en)
    fs.writeFileSync(pageTargets[1], pages.ru)
    console.log('build-readme: wrote docs/readme/en.md, docs/readme/ru.md')
  }
}
