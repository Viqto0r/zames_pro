// Assemble README.md and README.ru.md from two language sources.
//
// Why: npm renders exactly ONE readme per package (README.md in the root) and
// has no language tabs, so a separate README.ru.md is invisible on the npm
// page. But npm renders the readme with GitHub Flavored Markdown (via GitHub's
// API), so a <details> block DOES work there -- and on GitHub too. We therefore
// keep the English text on top and fold the other language into a collapsible
// block at the bottom.
//
// The two sources (docs/readme.en.md, docs/readme.ru.md) are the single point
// of edit for each language; this script wires the switcher and the collapsible
// cross-language block so neither README has to be maintained by hand. The
// generated files are committed; test/readme-built.test.ts re-runs buildReadmes()
// and fails if they drift from the sources.
//
// Usage:  node scripts/build-readme.mjs   (or: npm run build:readme)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NL = String.fromCharCode(10)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SWITCHER = '<!-- SWITCHER -->'

const REPO = 'https://github.com/Viqto0r/zames_pro/blob/master'
const EN_SWITCH = [
  '<p align="center">',
  '  <strong>English</strong> | <a href="' +
    REPO +
    '/README.ru.md">Русский</a>',
  '</p>',
].join(NL)
const RU_SWITCH = [
  '<p align="center">',
  '  <a href="' + REPO + '/README.md">English</a> | <strong>Русский</strong>',
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

function assemble(opts: {
  head: string
  switchLine: string
  body: string
  foldSummary: string
  foldBody: string
}): string {
  const { head, switchLine, body, foldSummary, foldBody } = opts
  return [
    head,
    '',
    switchLine,
    '',
    body,
    '',
    details(foldSummary, foldBody),
    '',
  ].join(NL)
}

// Returns the two generated readmes WITHOUT touching the disk, so a test can
// compare them against the committed files.
export function buildReadmes(rootDir: string): {
  readmeEn: string
  readmeRu: string
} {
  const en = readSource(rootDir, 'readme.en.md')
  const ru = readSource(rootDir, 'readme.ru.md')
  return {
    readmeEn: assemble({
      head: en.head,
      switchLine: EN_SWITCH,
      body: en.body,
      foldSummary: '🇷🇺 Читать по-русски (Russian)',
      foldBody: ru.body,
    }),
    readmeRu: assemble({
      head: ru.head,
      switchLine: RU_SWITCH,
      body: ru.body,
      foldSummary: '🇬🇧 Read in English',
      foldBody: en.body,
    }),
  }
}

// Run only when invoked directly (not when imported by a test).
const invoked =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  const { readmeEn, readmeRu } = buildReadmes(root)
  fs.writeFileSync(path.join(root, 'README.md'), readmeEn)
  fs.writeFileSync(path.join(root, 'README.ru.md'), readmeRu)
  console.log('build-readme: wrote README.md and README.ru.md')
}
