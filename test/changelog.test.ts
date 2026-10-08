import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseConventionalCommit,
  groupCommits,
  renderChangelogDraft,
  syncUnreleased,
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

// ---------- syncUnreleased (D2) ----------

test('syncUnreleased replaces the Unreleased body, keeps the next version', () => {
  const src = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [1.0.0] - 2020-01-01',
    '',
    '### Added',
    '',
    '- old',
    '',
  ].join('\n')
  const out = syncUnreleased(src, '## Fixed\n\n- a bug')
  assert.ok(out.includes('## Fixed'))
  assert.ok(out.includes('- a bug'))
  assert.ok(out.includes('## [1.0.0] - 2020-01-01'))
  assert.ok(out.includes('- old'))
  // The Unreleased heading is preserved exactly once.
  assert.equal(out.split('## [Unreleased]').length - 1, 1)
})

test('syncUnreleased clears the body when there is nothing to report', () => {
  const src = '## [Unreleased]\n\nstale text\n\n## [1.0.0]\n\n- x\n'
  const out = syncUnreleased(src, '')
  assert.ok(!out.includes('stale text'))
  assert.ok(out.includes('## [Unreleased]'))
  assert.ok(out.includes('## [1.0.0]'))
})

test('syncUnreleased is a no-op without an Unreleased heading', () => {
  const src = '## [1.0.0]\n\n- x\n'
  assert.equal(syncUnreleased(src, '## Fixed'), src)
})
