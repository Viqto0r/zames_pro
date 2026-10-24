// Conventional-Commits -> CHANGELOG draft. PURE and unit-tested: the draft is
// built from git log by scripts/changelog-draft.mts (and the release script),
// and `syncUnreleased` rewrites the Unreleased section only on the explicit
// --write flag — the changelog must stay a deliberate document, not a
// byproduct of whatever landed on the branch.

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

// Parse one commit SUBJECT into a conventional commit, or null when it does
// not follow the format (a free-form subject is skipped from the draft).
// `feat: add X`, `feat(cli): add X` and `fix!: change Y` are all understood. A
// `BREAKING CHANGE:` body footer is out of scope: git log %s carries no body.
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

// Group parsed commits by changelog kind. A scope is prefixed as `**scope:** `
// and a breaking marker appended as `(BREAKING)`. Duplicate lines are dropped
// so a rebase that repeats a subject does not list it twice.
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

// Render the groups as a changelog body, in the standard Keep-a-Changelog
// order and with empty groups omitted. Returns '' when there is nothing to report.
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
 * a freshly drafted body. PURE so a test can pin the exact behavior.
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
    // A drafted group heading must START a line of its own. When the draft
    // carries several groups (`## Added` … `## Fixed`) without a blank line
    // between them, the next group used to stay glued to the last bullet
    // (`- a### Fixed`) — it was not a heading at all, so the item vanished
    // from the rendered changelog.
    .replace(/([^\n])\n?(?=## )/g, '$1' + nl + nl)
    .trim()
    // The draft renders groups as `## Added` (top-level), but INSIDE the file
    // a version's groups are `### Added` (a subsection of the version heading).
    // `## [` (the next version) is left alone.
    .replace(/^## (?!\[)/gm, '### ')
  const section = cleanBody ? nl + nl + cleanBody + nl : nl
  return changelog.slice(0, afterAnchor) + section + tail
}
