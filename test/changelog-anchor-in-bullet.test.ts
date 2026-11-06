import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syncUnreleased } from '../src/changelog.ts'

// `syncUnreleased` finds its anchor with `changelog.indexOf('## [Unreleased]')`
// — ANYWHERE in the text, including INSIDE a bullet or a code fence that
// documents the format. It then rewrites everything from that point to the next
// `## [`, so the documenting bullet is cut in half and the drafted section
// lands in the middle of it.
//
// The anchor must be a REAL heading: at the start of a line.

const NL = String.fromCharCode(10)

function doc(): string {
  return [
    '# C',
    '',
    '- the file opens with `## [Unreleased]` and then the versions',
    '',
    '## [1.0.0] - x',
    '',
  ].join(NL)
}

test('a mention inside a bullet is not the anchor', () => {
  const out = syncUnreleased(doc(), '## Added' + NL + NL + '- a')
  assert.ok(
    out.includes(
      '- the file opens with `## [Unreleased]` and then the versions',
    ),
    JSON.stringify(out),
  )
  assert.equal(out.includes('### Added'), false, 'an anchor was invented')
})

test('a real heading is still rewritten', () => {
  const src =
    '# C' + NL + NL + '## [Unreleased]' + NL + NL + '## [1.0.0] - x' + NL
  const out = syncUnreleased(src, '## Added' + NL + NL + '- a')
  assert.match(out, /### Added/)
  assert.match(out, /- a/)
})
