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
const argRef = argv.find((a) => !a.startsWith('-'))

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
  const draftedLines = new Set(
    drafted
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  )
  const keep: string[] = []
  let group = ''
  for (const raw of section.split('\n')) {
    const line = raw.trim()
    if (/^#{2,3} /.test(line)) {
      group = line.replace(/^#{2,3} /, '')
      continue
    }
    if (!line.startsWith('- ')) continue
    if (draftedLines.has(line)) continue
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
const body = manual ? draftedBody + '\n\n' + manual : draftedBody

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
