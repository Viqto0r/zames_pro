import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// `npm run release` writes the dated CHANGELOG section itself. Its Unreleased
// guard (and the pre-push `changelog:check`) needs the section to be UP TO
// DATE first: the script used to run `npm test` (which includes
// test/docs-changelog) and then REPLACE the Unreleased body — a stale body
// made every release fail on its own gate, and the rewritten body was the
// reason a release commit could carry "Internal improvements." while the real
// fixes were never listed. The script must sync the Unreleased section and
// regenerate docs/changelog*.md BEFORE the tests.
const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'release.mts'),
  'utf-8',
)

test('the release script syncs the Unreleased section before the tests', () => {
  const tests = src.indexOf("run('npm', ['test'])")
  assert.ok(tests > 0, 'the test gate is missing')
  const sync = src.indexOf("['run', 'changelog:sync']")
  assert.ok(sync > 0, 'release never syncs the Unreleased section')
  assert.ok(sync < tests, 'the sync must run BEFORE the test gate')
})

test('the release script regenerates the changelog pages', () => {
  const pages = src.indexOf("['run', 'build:changelog']")
  const commit = src.indexOf("git(['commit'")
  assert.ok(pages > 0, 'release never regenerates docs/changelog*.md')
  assert.ok(commit > 0, 'the release commit is missing')
  assert.ok(pages < commit, 'the pages must be rebuilt before the commit')
})
