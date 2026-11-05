import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decideRelease,
  releaseHint,
  MIN_COMMITS,
} from '../src/release-policy.ts'

// The /loop cycles commit every step and must know WHEN the pile is big
// enough to cut a release. Too eager = one patch per fix on npm; too lazy =
// the unreleased section grows forever. The policy is the only place that
// decides, so it is pinned here.

test('a lone fix does not release', () => {
  const d = decideRelease(['fix(tui): keep the cursor visible'])
  assert.equal(d.bump, null)
  assert.equal(d.counted, 1)
})

test('MIN_COMMITS visible fixes release a patch', () => {
  const subjects = Array.from(
    { length: MIN_COMMITS },
    (_, i) => 'fix(scope' + i + '): something broken ' + i,
  )
  const d = decideRelease(subjects)
  assert.equal(d.bump, 'patch')
  assert.equal(d.counted, MIN_COMMITS)
})

test('a feature releases a minor on its own', () => {
  const d = decideRelease(['feat(cli): add a flag'])
  assert.equal(d.bump, 'minor')
})

test('a breaking change is never cut by the loop', () => {
  const d = decideRelease(['feat(api)!: rename the contract'])
  assert.equal(d.bump, 'major')
  assert.match(String(d.blocked), /BREAKING/)
})

test('internal commits neither count nor trigger a release', () => {
  const d = decideRelease([
    'docs: fix a typo',
    'chore(deps): bump x',
    'test(x): add a case',
    'ci: pin node',
    'build: rebuild',
  ])
  assert.equal(d.bump, null)
  assert.equal(d.counted, 0)
})

test('the release commit itself is not counted as work', () => {
  const subjects = [
    'chore: release 1.2.3',
    'fix(a): one',
    'fix(b): two',
    'fix(c): three',
    'fix(d): four',
  ]
  const d = decideRelease(subjects)
  assert.equal(d.counted, 4)
  assert.equal(d.bump, null)
})

test('the hint says how many commits are still missing', () => {
  const d = decideRelease(['fix(a): one', 'fix(b): two'])
  const hint = releaseHint(d, '1.0.0')
  assert.match(hint, /not yet/)
  assert.match(hint, new RegExp(String(MIN_COMMITS - 2) + ' more'))
})

test('a ready pile names the bump and the command', () => {
  const subjects = Array.from(
    { length: MIN_COMMITS },
    (_, i) => 'perf(m' + i + '): faster ' + i,
  )
  const hint = releaseHint(decideRelease(subjects), '1.0.0')
  assert.match(hint, /READY: npm run release patch/)
})

test('an unknown subject is skipped, not counted', () => {
  const d = decideRelease(['just some words', 'fix(a): one'])
  assert.equal(d.counted, 1)
  assert.equal(d.bump, null)
})
