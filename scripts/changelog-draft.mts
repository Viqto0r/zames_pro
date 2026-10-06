import { spawnSync } from 'node:child_process'
import {
  parseConventionalCommit,
  groupCommits,
  renderChangelogDraft,
} from '../src/changelog.js'

// Draft a CHANGELOG section from conventional commits since a ref (BACKLOG
// D2). PRINTS to stdout and never touches CHANGELOG.md -- the operator (or
// the agent) pastes the result in by hand, so a bad commit subject can never
// corrupt the changelog.
//
// Usage:
//   npm run changelog:draft            # since the latest tag, or an explicit ref
//   npm run changelog:draft -- v2.63.0

function git(args: string[]): string {
  const r = spawnSync('git', args, { encoding: 'utf-8' })
  if (r.status !== 0) return ''
  return (r.stdout || '').toString()
}

const argRef = process.argv.slice(2).find((a) => !a.startsWith('-'))

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

if (!body) {
  console.error('no conventional commits since ' + ref)
  process.exit(0)
}

console.log('## [Unreleased]')
console.log('')
console.log(body)
