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

// Draft a CHANGELOG section from conventional commits since a ref (BACKLOG
// D2). PRINTS to stdout and never touches CHANGELOG.md -- the operator (or
// the agent) pastes the result in by hand, so a bad commit subject can never
// corrupt the changelog.
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
const body = renderChangelogDraft(groupCommits(parsed))

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const changelogPath = path.join(root, 'CHANGELOG.md')

// D2: sync the `## [Unreleased]` section in CHANGELOG.md from the conventional
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
