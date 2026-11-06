import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syncUnreleased } from '../src/changelog.ts'

// A commit subject is FREE TEXT: a scope or a description may legitimately
// contain `##` (a commit that documents a markdown heading, like
// `fix(backlog): ignore a ## P<n> header`). The blank-line rule punched a
// newline before EVERY `##` inside a line, so the bullet was SPLIT and its
// tail became a fake changelog HEADING — the generated CHANGELOG.md was
// structurally corrupted and the release gate failed.
const NL = String.fromCharCode(10)

const file = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '## [1.0.0] - 2020-01-01',
  '',
].join(NL)

test('a `##` inside a commit description does not become a heading', () => {
  const body = '## Fixed' + NL + NL + '- **backlog:** ignore a `## P<n>` header'
  const out = syncUnreleased(file, body)
  assert.ok(
    out.includes('- **backlog:** ignore a `## P<n>` header'),
    'the bullet was split: ' + JSON.stringify(out),
  )
  assert.ok(
    !/^### P<n>/m.test(out),
    'a fake heading was injected: ' + JSON.stringify(out),
  )
})

test('a real group heading still gets its blank line', () => {
  const body = '## Fixed' + NL + NL + '- one' + '## Added' + NL + NL + '- two'
  const out = syncUnreleased(file, body)
  // A group heading glued to the previous bullet is broken onto its own line
  // (the bug that made it not render at all), and both groups survive.
  assert.ok(/### Fixed/.test(out), JSON.stringify(out))
  assert.ok(/### Added/.test(out), JSON.stringify(out))
  assert.ok(
    out.indexOf('- two') > out.indexOf('### Added'),
    JSON.stringify(out),
  )
})
