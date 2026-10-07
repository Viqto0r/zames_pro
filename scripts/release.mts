import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseConventionalCommit,
  groupCommits,
  renderChangelogDraft,
} from '../src/changelog.js'

// One-command release prep (BACKLOG G4). The manual sequence — bump
// package.json, write a dated CHANGELOG section, commit `chore: release X.Y.Z`,
// tag — is easy to get wrong, so this script does the deterministic parts and
// STOPS before the push. Pushing the branch and the tag is deliberately a
// separate, explicit step: the tag triggers the npm publish workflow, and that
// must never happen by accident.
//
// Usage:
//   npm run release patch            # bug fixes
//   npm run release minor            # new features
//   npm run release major            # breaking changes
//   npm run release patch --no-tests # skip the local test run (CI still runs)
//   npm run release patch --dry-run  # print the plan, change nothing
//
// Run via tsx so it can reuse src/changelog.ts (the conventional-commit
// parser) — a plain .mjs cannot import the TypeScript sources.

const NL = String.fromCharCode(10)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function git(args: string[], allowFail = false): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf-8' })
  if (r.status !== 0 && !allowFail) {
    console.error('git ' + args.join(' ') + ' failed:' + NL + (r.stderr || ''))
    process.exit(1)
  }
  return (r.stdout || '').toString()
}

function fail(msg: string): never {
  console.error('release: ' + msg)
  process.exit(1)
}

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) fail(cmd + ' ' + args.join(' ') + ' exited ' + r.status)
}

const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => a.startsWith('--')))
const bump = argv.find((a) => !a.startsWith('--'))
const dryRun = flags.has('--dry-run')
const skipTests = flags.has('--no-tests')

if (bump !== 'patch' && bump !== 'minor' && bump !== 'major') {
  fail('usage: npm run release patch|minor|major [--no-tests] [--dry-run]')
}

// 1. Clean tree: a release commit must contain ONLY the version bump and the
// changelog section, never half-finished work.
const dirty = git(['status', '--porcelain']).trim()
if (dirty) {
  fail('working tree is not clean:' + NL + dirty)
}

// 2. Gates. The git hooks run these on commit/push too, but a release should
// fail EARLY, before package.json/CHANGELOG are touched.
if (!skipTests) {
  run('npm', ['run', 'typecheck'])
  run('npm', ['test'])
}

// 3. Compute the next version from package.json.
const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
  version: string
}
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version)
if (!m) fail('package.json version is not a plain x.y.z: ' + pkg.version)
let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])]
if (bump === 'major') {
  major += 1
  minor = 0
  patch = 0
} else if (bump === 'minor') {
  minor += 1
  patch = 0
} else {
  patch += 1
}
const next = major + '.' + minor + '.' + patch
const tag = 'v' + next

if (git(['tag', '--list', tag]).trim()) {
  fail('tag ' + tag + ' already exists')
}

// 4. Build the dated CHANGELOG section from conventional commits since the
// last tag. English commit subjects become the section body; the operator can
// still reword the section afterwards.
const latestTag = git(['describe', '--tags', '--abbrev=0'], true).trim()
const ref = latestTag || git(['rev-list', '--max-parents=0', 'HEAD']).trim().split(NL).pop() || 'HEAD'
const subjects = git(['log', '--no-merges', '--pretty=format:%s', ref + '..HEAD'])
  .split(NL)
  .map((s) => s.trim())
  .filter(Boolean)
const parsed = subjects
  .map(parseConventionalCommit)
  .filter((c): c is NonNullable<typeof c> => c !== null)
const body = renderChangelogDraft(groupCommits(parsed))

// CHANGELOG groups are `### Added` (Keep a Changelog), the draft renders
// `## Added` — normalize here.
const sectionBody = body
  .split(NL)
  .map((line) => (line.startsWith('## ') ? '#' + line : line))
  .join(NL)
const date = new Date().toISOString().slice(0, 10)
const section =
  '## [' + next + '] - ' + date + NL + NL + (sectionBody || '### Changed' + NL + NL + '- Internal improvements.') + NL

if (dryRun) {
  console.log('release(dry-run): ' + pkg.version + ' -> ' + next)
  console.log('tag: ' + tag)
  console.log('since: ' + ref)
  console.log('CHANGELOG section:' + NL + section)
  process.exit(0)
}

// 5. Insert the section right after the `## [Unreleased]` heading.
const changelogPath = path.join(root, 'CHANGELOG.md')
const changelog = fs.readFileSync(changelogPath, 'utf-8')
const anchor = '## [Unreleased]'
const idx = changelog.indexOf(anchor)
if (idx < 0) fail('CHANGELOG.md has no "' + anchor + '" heading')
const afterAnchor = idx + anchor.length
const updated =
  changelog.slice(0, afterAnchor) +
  NL + NL + section +
  changelog.slice(afterAnchor).replace(/^\n+/, NL)
fs.writeFileSync(changelogPath, updated)

// 6. Bump package.json, preserving its exact formatting (single-line replace
// of the version value only).
const pkgText = fs.readFileSync(pkgPath, 'utf-8')
fs.writeFileSync(pkgPath, pkgText.replace('"version": "' + pkg.version + '"', '"version": "' + next + '"'))

// 7. Commit + tag. The push is intentionally NOT done here.
git(['add', 'package.json', 'CHANGELOG.md'])
git(['commit', '-m', 'chore: release ' + next])
git(['tag', tag])

console.log(NL + 'release: committed and tagged ' + tag)
console.log('Next (explicit) step — publish via CI:')
console.log('  git push')
console.log('  git push origin ' + tag)
