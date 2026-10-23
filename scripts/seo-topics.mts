// Print (or apply) the canonical GitHub topics for the repository.
//
// Why a script: topics are GitHub repository METADATA, not a file, so they
// cannot live in git and are easy to forget on a rename or a new topic. The
// canonical list lives in docs/seo-topics.json (plain data, no API key needed
// to review it) and this script turns it into a `gh` command. GitHub topics
// feed both the GitHub search and Google's index of the repository.
//
// Usage:
//   npm run seo:topics              # print the command
//   npm run seo:topics -- --apply   # run it via the GitHub CLI

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function readTopics(rootDir: string): string[] {
  const raw = fs.readFileSync(
    path.join(rootDir, 'docs', 'seo-topics.json'),
    'utf-8',
  )
  const topics = JSON.parse(raw) as string[]
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error('docs/seo-topics.json must be a non-empty array')
  }
  for (const t of topics) {
    // GitHub accepts lower-case alphanumerics and single hyphens, max 50 chars.
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t) || t.length > 50) {
      throw new Error('invalid GitHub topic: ' + JSON.stringify(t))
    }
  }
  return topics
}

export function topicsCommand(topics: string[]): string[] {
  return ['repo', 'edit', '--add-topic', topics.join(',')]
}

const invoked =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  const topics = readTopics(root)
  const args = topicsCommand(topics)
  const apply = process.argv.includes('--apply')
  if (!apply) {
    console.log('gh ' + args.join(' '))
    console.log('run with --apply to execute it')
  } else {
    const r = spawnSync('gh', args, { cwd: root, stdio: 'inherit' })
    process.exit(r.status ?? 1)
  }
}
