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
// cross-language block so neither language has to be maintained by hand. The
// generated file is committed; test/readme-built.test.ts re-runs buildReadmes()
// and fails if it drifts from the sources.
//
// Usage:  npom run build:readme

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NL = String.fromCharCode(10)
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
      file + ' has no ' + SWITCHER + ' marker (was it edited by hand?)',
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
  fs.writeFileSync(path.join(root, 'README.md'), readmeEn)
  console.log('build-readme: wrote README.md')
}
