import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseConventionalCommit,
  groupCommits,
  renderChangelogDraft,
} from '../src/changelog.ts'

// ---------- parseConventionalCommit ----------

test('parses a simple feat', () => {
  assert.deepEqual(parseConventionalCommit('feat: add a thing'), {
    type: 'feat',
    scope: undefined,
    breaking: false,
    description: 'add a thing',
  })
})

test('parses a scoped commit', () => {
  const c = parseConventionalCommit('fix(ui): keep the label')
  assert.equal(c?.type, 'fix')
  assert.equal(c?.scope, 'ui')
  assert.equal(c?.description, 'keep the label')
})

test('detects the breaking ! marker', () => {
  assert.equal(parseConventionalCommit('feat!: drop X')?.breaking, true)
  assert.equal(parseConventionalCommit('feat(api)!: drop X')?.breaking, true)
  assert.equal(parseConventionalCommit('feat: keep X')?.breaking, false)
})

test('is case-insensitive on the type', () => {
  assert.equal(parseConventionalCommit('FIX: x')?.type, 'fix')
})

test('rejects a free-form subject', () => {
  assert.equal(parseConventionalCommit('just some text'), null)
  assert.equal(parseConventionalCommit(''), null)
  assert.equal(parseConventionalCommit('feat:'), null)
})

// ---------- groupCommits ----------

test('maps types to changelog kinds', () => {
  const g = groupCommits([
    parseConventionalCommit('feat: a')!,
    parseConventionalCommit('fix: b')!,
    parseConventionalCommit('refactor: c')!,
    parseConventionalCommit('remove: d')!,
  ])
  assert.deepEqual(g.Added, ['- a'])
  assert.deepEqual(g.Fixed, ['- b'])
  assert.deepEqual(g.Changed, ['- c'])
  assert.deepEqual(g.Removed, ['- d'])
})

test('skips chore/ci/test/docs/build types', () => {
  const g = groupCommits([
    parseConventionalCommit('chore: x')!,
    parseConventionalCommit('ci: y')!,
    parseConventionalCommit('test: z')!,
    parseConventionalCommit('docs: w')!,
  ])
  assert.equal(
    g.Added.length + g.Fixed.length + g.Changed.length + g.Removed.length,
    0,
  )
})

test('adds the scope prefix and the BREAKING marker', () => {
  const g = groupCommits([parseConventionalCommit('feat(cli)!: drop it')!])
  assert.deepEqual(g.Added, ['- **cli:** drop it (BREAKING)'])
})

test('drops duplicate lines (a rebase must not flip the draft twice)', () => {
  const g = groupCommits([
    parseConventionalCommit('fix: same')!,
    parseConventionalCommit('fix: same')!,
  ])
  assert.equal(g.Fixed.length, 1)
})

// ---------- renderChangelogDraft ----------

test('renders the standard order and omits empty groups', () => {
  const out = renderChangelogDraft({
    Added: ['- a'],
    Fixed: ['- b'],
    Changed: [],
    Removed: ['- d'],
  })
  assert.equal(out, '## Added\n\n- a\n\n## Fixed\n\n- b\n\n## Removed\n\n- d')
  assert.ok(!out.includes('## Changed'))
})

test('renders an empty string for empty groups', () => {
  assert.equal(
    renderChangelogDraft({ Added: [], Fixed: [], Changed: [], Removed: [] }),
    '',
  )
})

test('maps the remaining Changed types (perf/style/revert)', () => {
  const g = groupCommits([
    parseConventionalCommit('perf: faster')!,
    parseConventionalCommit('style: tidy')!,
    parseConventionalCommit('revert: undo')!,
  ])
  assert.deepEqual(g.Changed, ['- faster', '- tidy', '- undo'])
})

test('groupCommits tolerates an empty list', () => {
  const g = groupCommits([])
  assert.deepEqual(g, { Added: [], Fixed: [], Changed: [], Removed: [] })
})
