import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseConventionalCommit,
  groupCommits,
  renderChangelogDraft,
  syncUnreleased,
} from '../src/changelog.js'

// Draft a CHANGELOG section from conventional commits since a ref.
// `npm run changelog:sync` (--write) updates the Unreleased section IN PLACE, so
// no step needs a human paste: `npm run release` calls it, and
// `npm run changelog:check` fails when the section is stale.
//
// Usage:
//   npm run changelog:draft            # since the latest tag, or an explicit ref
//   npm run changelog:draft -- v2.63.0
//   npm run changelog:draft -- --write  # update the Unreleased section in place
//   npm run changelog:draft -- --check  # exit 1 if Unreleased is out of date

function git(args: string[]): string {
  const r = spawnSync('git', args, { encoding: 'utf-8' })
  if (r.status !== 0) return ''
  return (r.stdout || '').toString()
}

const argv = process.argv.slice(2)
const write = argv.includes('--write')
const check = argv.includes('--check')
// A pre-commit hook runs BEFORE the commit exists, so its subject is not in
// `git log` yet. `--extra-subject <subject>` folds the message being committed
// into the draft, which keeps the synced section green on the new commit
// instead of one commit late.
const extraIdx = argv.indexOf('--extra-subject')
const extraSubjects =
  extraIdx >= 0 && argv[extraIdx + 1] ? [argv[extraIdx + 1]] : []
const argRef = argv.find(
  (a, i) => !a.startsWith('-') && argv[i - 1] !== '--extra-subject',
)

// Resolve the start ref: an explicit arg, otherwise the latest tag,
// otherwise the root commit.
const latestTag = git(['describe', '--tags', '--abbrev=0']).trim()
const ref =
  argRef ||
  latestTag ||
  git(['revlist', 'HEAD']).trim().split('\n').pop() ||
  'HEAD'

const subjects = git([
  'log',
  '--no-merges',
  '--pretty=format:%s',
  `${ref}..HEAD`,
])
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .concat(extraSubjects)

const parsed = subjects
  .map(parseConventionalCommit)
  .filter((c): c is NonNullable<typeof c> => c !== null)
// Hand-written Unreleased notes (a feature landed but is not committed yet,
// or a commit message that does not follow the conventional format) must
// SURVIVE the sync: only the AUTO-DRAFTED groups are replaced. The manual text
// is everything in the current section that the draft would not produce; it is
// appended after the drafted body so `changelog:check` never deletes it.
const manualUnreleased = (current: string, drafted: string): string => {
  const anchor = '## [Unreleased]'
  const idx = current.indexOf(anchor)
  if (idx < 0) return ''
  const rest = current.slice(idx + anchor.length)
  const next = rest.search(/\n## \[/)
  const section = next < 0 ? rest : rest.slice(0, next)
  // A drafted bullet is a PREFIX of a hand-written one (`- **spinner:** X`
  // vs `- **spinner:** X, so Y`): a Set membership test cannot see that and
  // kept the manual copy, which then rendered as a SECOND bullet for the same
  // change. Dedupe by prefix in BOTH directions.
  const draftedBullets = drafted
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
  const isDrafted = (line: string): boolean =>
    draftedBullets.some((d) => line.startsWith(d) || d.startsWith(line))
  const keep: string[] = []
  let group = ''
  for (const raw of section.split('\n')) {
    const line = raw.trim()
    if (/^#{2,3} /.test(line)) {
      group = line.replace(/^#{2,3} /, '')
      continue
    }
    if (!line.startsWith('- ')) continue
    if (isDrafted(line)) continue
    keep.push(line + '\u0000' + group)
  }
  if (!keep.length) return ''
  const byGroup = new Map<string, string[]>()
  for (const item of keep) {
    const [line, g] = item.split('\u0000')
    const list = byGroup.get(g) || []
    list.push(line)
    byGroup.set(g, list)
  }
  const order = ['Added', 'Fixed', 'Changed', 'Removed']
  const out: string[] = []
  for (const kind of order) {
    const list = byGroup.get(kind)
    if (!list || !list.length) continue
    out.push('## ' + kind, '', ...list, '')
  }
  return out.join('\n').trimEnd()
}

// A manual note that shares its group with DRAFTED lines (e.g. a hand-written
// `- Fixed` bullet when the draft already has a `## Fixed`) must land INSIDE
// that group: appending the whole manual block after the draft produced a
// SECOND `### Fixed` heading, so one change looked like two. A group the draft
// does not have still gets its own heading.
const mergeManualIntoDraft = (drafted: string, manual: string): string => {
  if (!manual) return drafted
  const blocks = manual.split(/\n(?=## )/)
  let out = drafted
  const extra: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const name = /^## (.+)$/.exec(lines[0].trim())?.[1]
    const bullets = lines.filter((l) => l.trim().startsWith('- '))
    const draftedHeading = name ? '## ' + name : ''
    if (name && out.includes(draftedHeading)) {
      // Insert right after the last bullet of that drafted group (not at the
      // group's trailing blank line), so the manual note joins the list
      // instead of starting a paragraph of its own.
      const start = out.indexOf(draftedHeading)
      const rest = out.slice(start + draftedHeading.length)
      const next = rest.search(/\n## /)
      const groupText = (next < 0 ? rest : rest.slice(0, next)).trimEnd()
      const insertAt = start + draftedHeading.length + groupText.length
      out =
        out.slice(0, insertAt) + '\n' + bullets.join('\n') + out.slice(insertAt)
    } else {
      extra.push(block)
    }
  }
  const tail = extra.join('\n').trimEnd()
  return tail ? out.trimEnd() + '\n\n' + tail : out.trimEnd()
}

const draftedBody = renderChangelogDraft(groupCommits(parsed))
const onDiskForManual = fs.readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'CHANGELOG.md',
  ),
  'utf-8',
)
const manual = manualUnreleased(onDiskForManual, draftedBody)
const body = mergeManualIntoDraft(draftedBody, manual)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const changelogPath = path.join(root, 'CHANGELOG.md')

// Sync the `## [Unreleased]` section in CHANGELOG.md from the conventional
// commits since the last tag. `--write` edits the file; `--check` fails when
// the committed section is out of date (for CI); neither just prints the body.
if (write || check) {
  const onDisk = fs.readFileSync(changelogPath, 'utf-8')
  const nextText = syncUnreleased(onDisk, body)
  if (write) {
    if (nextText !== onDisk) {
      fs.writeFileSync(changelogPath, nextText)
      console.log('changelog: updated the Unreleased section')
    } else {
      console.log('changelog: Unreleased already up to date')
    }
    process.exit(0)
  }
  if (nextText !== onDisk) {
    console.error(
      'changelog: the Unreleased section is out of date — run `npm run changelog:sync`',
    )
    process.exit(1)
  }
  console.log('changelog: Unreleased is up to date')
  process.exit(0)
}

if (!body) {
  console.error('no conventional commits since ' + ref)
  process.exit(0)
}

console.log('## [Unreleased]')
console.log('')
console.log(body)
