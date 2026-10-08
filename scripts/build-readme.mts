// Assemble README.md and README.ru.md from two language sources.
//
// Why: npm renders exactly ONE readme per package (README.md in the root) and
// has no language tabs, so a separate README.ru.md is invisible on the npm
// page. But npm renders the readme with GitHub Flavored Markdown (via
// GitHub's API), so a <details> block DOES work there -- and on GitHub too.
// We therefore keep the English text on top and fold the other language into
// a collapsible block at the bottom. README.ru.md is generated too so the
// GitHub switcher can point at it directly, but it is NOT published to npm
// (see "files" in package.json):
// it would just duplicate the folded block.
//
// The two sources (docs/readme.en.md, docs/readme.ru.md) are the single point
// of edit for each language; this script wires the switcher and the collapsible
// cross-language block so neither README has to be maintained by hand. The
// generated files are committed; test/readme-built.test.ts re-runs buildReadmes()
// and fails if they drift from the sources.
//
// Usage:  npm run build:readme

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

// Returns the two generated readmes WITHOUT touching the disk, so a test can
// compare them against the committed files. Both files carry the SAME content
// (English on top, Russian folded): README.md is what npm publishes, and
// README.ru.md exists only so the GitHub language switcher has a target. The
// switcher is an IN-PAGE `#readme-ru` anchor, so it works from either file
// without fetching the other one.
export function buildReadmes(rootDir: string): {
  readmeEn: string
  readmeRu: string
} {
  const en = readSource(rootDir, 'readme.en.md')
  const ru = readSource(rootDir, 'readme.ru.md')
  const doc = [
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
  return { readmeEn: doc, readmeRu: doc }
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
