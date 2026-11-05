// WHEN a /loop improvement cycle may cut a release. PURE and unit-tested: the
// decision is made from the commits since the last tag, and it is the one rule
// that keeps an unattended run from either spamming npm with a patch per fix
// or sitting on a pile of unreleased work forever.
//
// The policy is deliberately COARSE. DEVELOPING.md says several fixes land as
// ONE patch release (a 142-patch 2.82.x branch made the CHANGELOG and npm
// unreadable), so a lone fix is NOT enough: at least MIN_COMMITS user-visible
// changes must have accumulated. A feature or a breaking change is the
// operator's own signal and releases alone.
//
// docs/chore/test/ci/build commits do not count (they never appear in a
// user-facing changelog), but they also must not BLOCK a release: they are
// simply ignored.

import {
  parseConventionalCommit,
  groupCommits,
  type ConventionalCommit,
} from './changelog.js'

/** User-visible commits (feat/fix/perf/refactor/revert/remove) that release together. */
export const MIN_COMMITS = 5

export type BumpKind = 'patch' | 'minor' | 'major'

export interface ReleaseDecision {
  /** The bump to cut, or null when the branch should wait for more work. */
  bump: BumpKind | null
  /** User-visible commits since the last tag (the ones the policy counts). */
  counted: number
  /** The commit types that were counted, for the operator-facing report. */
  kinds: string[]
  /** Set when a release must NOT happen even if `bump` is set. */
  blocked?: string
}

/**
 * Decide whether the commits in `subjects` (git log --pretty=format:%s since
 * the last tag) justify a release, and which bump it is.
 *
 * - a `!` marker -> major (alone);
 * - any `feat:` -> minor (alone);
 * - otherwise at least MIN_COMMITS visible commits -> patch;
 * - anything less -> `bump: null` (wait; the next step adds to the pile).
 */
export function decideRelease(
  subjects: string[],
  opts: { minCommits?: number } = {},
): ReleaseDecision {
  const min = opts.minCommits ?? MIN_COMMITS
  const parsed = (subjects || [])
    .map((s) => parseConventionalCommit(String(s ?? '')))
    .filter((c): c is ConventionalCommit => c !== null)

  // A chore(release) commit is the release itself; it must not be counted as
  // work and must not trigger a second release.
  const work = parsed.filter(
    (c) => !(c.type === 'chore' && c.scope === 'release'),
  )

  const breaking = work.filter((c) => c.breaking)
  if (breaking.length) {
    return {
      bump: 'major',
      counted: work.length,
      kinds: kindsOf(work),
      blocked: breakingNote(breaking),
    }
  }

  const feats = work.filter((c) => c.type === 'feat')
  if (feats.length) {
    return { bump: 'minor', counted: work.length, kinds: kindsOf(work) }
  }

  // The changelog groups are the source of truth for "user-visible": a type
  // that renders NO line (docs/test/chore/ci/build) is not work worth a
  // release on its own.
  const groups = groupCommits(work)
  const visible =
    groups.Added.length +
    groups.Fixed.length +
    groups.Changed.length +
    groups.Removed.length
  if (visible < min) {
    return { bump: null, counted: visible, kinds: kindsOf(work) }
  }
  return { bump: 'patch', counted: visible, kinds: kindsOf(work) }
}

function kindsOf(list: ConventionalCommit[]): string[] {
  const seen: string[] = []
  for (const c of list) if (!seen.includes(c.type)) seen.push(c.type)
  return seen
}

function breakingNote(list: ConventionalCommit[]): string {
  const first = list[0]
  return (
    'a BREAKING change (' +
    (first.scope ? first.scope + '): ' : '') +
    first.description +
    ') must be released by the operator, not by an unattended /loop'
  )
}

/**
 * A `/loop` must NEVER publish. `npm run release` only commits and tags, but
 * the tag is what triggers the npm publish workflow — so a cycle that tagged
 * would publish on its own.
 */
export const LOOP_RELEASE_BLOCKED =
  'an unattended /loop must not tag: a tag push publishes to npm. ' +
  'Report the ready bump and let the operator run `npm run release <bump>`.'

/**
 * The one line a cycle prints (and writes into QUEUE.md) when the pile is big
 * enough for a release.
 */
export function releaseHint(d: ReleaseDecision, version: string): string {
  if (d.blocked) return 'release blocked: ' + d.blocked
  if (!d.bump) {
    const left = Math.max(0, MIN_COMMITS - d.counted)
    return (
      'release: not yet (' +
      d.counted +
      '/' +
      MIN_COMMITS +
      ' user-visible commits; ' +
      left +
      ' more)'
    )
  }
  return 'release READY: npm run release ' + d.bump + ' (from ' + version + ')'
}
