import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReadmes, RU_ANCHOR } from '../scripts/build-readme.mts'

// README.md is GENERATED from docs/readme.{en,ru}.md by scripts/build-readme.mts
// (the two sources are the single point of edit for each language). The
// generated file is committed, so a hand-edit would silently diverge from its
// source. This test re-runs the builder and fails on any drift.
//
// There is NO separate README.ru.md anymore: the Russian text lives inside a
// <details> block in README.md (npm renders GFM via the GitHub API, so the
// block works on both GitHub and npm), and the language switcher links to an
// in-page anchor.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('README.md is in sync with docs/readme.*.md', () => {
  const { readmeEn } = buildReadmes(root)
  const onDisk = fs.readFileSync(path.join(root, 'README.md'), 'utf-8')
  assert.equal(onDisk, readmeEn, 'README.md drifted: run npm run build:readme')
})

test('the folded Russian block is inside README.md (readable on npm)', () => {
  const onDisk = fs.readFileSync(path.join(root, 'README.md'), 'utf-8')
  assert.ok(onDisk.includes('<details>'), 'README.md has no <details> block')
  const ruTitle = String.fromCodePoint(
    0x422,
    0x435,
    0x440,
    0x43c,
    0x438,
    0x43d,
    0x430,
    0x43b,
    0x44c,
    0x43d,
    0x44b,
    0x439,
  )
  assert.ok(
    onDisk.includes(ruTitle),
    'the folded block does not carry the Russian text',
  )
})

test('only README.md is generated (no second readme file)', () => {
  const distRu = fs.existsSync(path.join(root, 'README.ru.md'))
  assert.equal(distRu, false, 'README.ru.md must not exist anymore')
})

test('the switcher links to the in-page anchor', () => {
  const onDisk = fs.readFileSync(path.join(root, 'README.md'), 'utf-8')
  assert.ok(
    onDisk.includes('#readme-ru'),
    'the switcher has no #readme-ru link',
  )
  assert.ok(onDisk.includes(RU_ANCHOR), 'the anchor is missing')
})
