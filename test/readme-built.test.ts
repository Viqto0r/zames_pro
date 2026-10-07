import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReadmes } from '../scripts/build-readme.mts'

// README.md / README.ru.md are GENERATED from docs/readme.{en,ru}.md by
// scripts/build-readme.mjs (the two sources are the single point of edit for
// each language). The generated files are committed, so a hand-edit of a README
// would silently diverge from its source. This test re-runs the builder and
// fails on any drift.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('README.md and README.ru.md are in sync with docs/readme.*.md', () => {
  const { readmeEn, readmeRu } = buildReadmes(root)
  const onDiskEn = fs.readFileSync(path.join(root, 'README.md'), 'utf-8')
  const onDiskRu = fs.readFileSync(path.join(root, 'README.ru.md'), 'utf-8')
  assert.equal(
    onDiskEn,
    readmeEn,
    'README.md drifted from docs/readme.en.md — run `npm run build:readme`',
  )
  assert.equal(
    onDiskRu,
    readmeRu,
    'README.ru.md drifted from docs/readme.ru.md — run `npm run build:readme`',
  )
})

test('the folded Russian block is inside README.md (readable on npm)', () => {
  const onDiskEn = fs.readFileSync(path.join(root, 'README.md'), 'utf-8')
  // npm renders GFM via GitHub's API, so <details> works there: the Russian
  // translation must live INSIDE README.md, not only in README.ru.md.
  assert.ok(onDiskEn.includes('<details>'), 'README.md has no <details> block')
  assert.ok(
    /<details>\s*<summary>[\s\S]*?<\/summary>[\s\S]*?Терминальный coding-агент[\s\S]*?<\/details>/.test(
      onDiskEn,
    ),
    'README.md has no collapsible Russian section',
  )
  assert.ok(
    onDiskEn.includes('Терминальный coding-агент'),
    'the folded block does not carry the Russian text',
  )
})
