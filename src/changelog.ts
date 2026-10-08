// Conventional-Commits -> CHANGELOG draft (BACKLOG D2). PURE and
// unit-tested: the draft is built from git log OUTSIDE the release flow
// (scripts/changelog-draft.mts), so a misparse never touches CHANGELOG.md.
// We do NOT auto-write the file: a human (or the agent) reviews the draft
// first -- the changelog must stay a deliberate document, not a byproduct.

export type ChangeKind = 'Added' | 'Fixed' | 'Changed' | 'Removed'

export interface ConventionalCommit {
  type: string
  scope?: string
  /** A `!:` marker means a BREAKING change (major bump). */
  breaking: boolean
  description: string
}

export interface ChangelogGroups {
  Added: string[]
  Fixed: string[]
  Changed: string[]
  Removed: string[]
}

// Parse one commit SUBJECT into a conventional commit, or null when it
// does not follow the format (a free-form subject is skipped from the draft).
// Supported forms:
//   feat: add X            feat(cli): add X
//   fix!: change Y         feat!: breaking
// Explicit breaking markers: `!` after the type/scope. A BREAKING CHANGE
// body footer is beyond a subject-only parser (git log %s only) -- out of scope.
export function parseConventionalCommit(
  subject: string,
): ConventionalCommit | null {
  const s = String(subject ?? '').trim()
  if (!s) return null
  // <type>(<scope>)!?: <description>
  const m = /^([a-zA-Z]+)(\(.+?\))?(!)?:\s*(.+)$/.exec(s)
  if (!m) return null
  const type = m[1].toLowerCase()
  const scope = m[2] ? m[2].slice(1, -1).trim() : undefined
  const breaking = m[3] === '!'
  const description = (m[4] || '').trim()
  if (!description) return null
  return { type, scope, breaking, description }
}

const KIND_BY_TYPE = {
  feat: 'Added',
  fix: 'Fixed',
  perf: 'Changed',
  refactor: 'Changed',
  style: 'Changed',
  revert: 'Changed',
  remove: 'Removed',
} as const

// Types that never belong in a user-facing changelog (build/CI/internal).
const SKIP_TYPES = new Set(['chore', 'ci', 'test', 'build', 'docs', 'internal'])

// Group parsed commits by changelog kind. Each entry is a short
// imperative line; a scope is prefixed as `**scope:** ` and a breaking marker
// is appended as `(BREAKING)`. Order within a group is preserved (commit
// order), and duplicate lines are dropped so a rebase that repeats a subject
// does not flip the draft twice.
export function groupCommits(forCommit: ConventionalCommit[]): ChangelogGroups {
  const groups: ChangelogGroups = {
    Added: [],
    Fixed: [],
    Changed: [],
    Removed: [],
  }
  const seen = new Set<string>()
  for (const c of forCommit || []) {
    const kind = KIND_BY_TYPE[c.type as keyof typeof KIND_BY_TYPE]
    if (!kind || SKIP_TYPES.has(c.type)) continue
    const prefix = c.scope ? '**' + c.scope + ':** ' : ''
    const line =
      '- ' + prefix + c.description + (c.breaking ? ' (BREAKING)' : '')
    if (seen.has(line)) continue
    seen.add(line)
    groups[kind].push(line)
  }
  return groups
}

// Render the groups as a changelog body (the parts under a version
// heading), with the standard Keep-a-Changelog order and empty groups
// omitted. Returns '' when there is nothing to report.
export function renderChangelogDraft(groups: ChangelogGroups): string {
  const order: ChangeKind[] = ['Added', 'Fixed', 'Changed', 'Removed']
  const out: string[] = []
  for (const kind of order) {
    const items = groups[kind] || []
    if (!items.length) continue
    out.push('## ' + kind, '')
    out.push(...items, '')
  }
  return out.join('\n').trimEnd()
}

/**
 * Replace the body between `## [Unreleased]` and the next `## [` heading with
 * a freshly drafted body (D2). PURE so a test can pin the exact behavior.
 *
 * When `body` is empty the existing Unreleased section is CLEARED to just the
 * heading (no stray blank content). A changelog without an Unreleased heading
 * is returned UNCHANGED (we never guess where to insert one).
 */
export function syncUnreleased(changelog: string, body: string): string {
  const nl = '\n'
  const anchor = '## [Unreleased]'
  const idx = changelog.indexOf(anchor)
  if (idx < 0) return changelog
  const afterAnchor = idx + anchor.length
  // The section ends at the next top-level `## [` (the next version).
  const rest = changelog.slice(afterAnchor)
  const next = rest.search(/\n## \[/)
  const tail = next < 0 ? '' : rest.slice(next)
  const cleanBody = String(body || '')
    .replace(/^## \[Unreleased\]\s*/m, '')
    .trim()
  const section = cleanBody ? nl + nl + cleanBody + nl : nl
  return changelog.slice(0, afterAnchor) + section + tail
}
