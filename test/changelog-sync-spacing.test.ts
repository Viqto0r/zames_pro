// PURE changelog sync (src/changelog.ts): the drafted body must be inserted
// as ONE block, not glued to the previous group heading.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syncUnreleased } from '../src/changelog.ts'

const NL = String.fromCharCode(10)

test('syncUnreleased separates several drafted groups with a blank line', () => {
  const src = ['## [Unreleased]', '', '## [1.0.0]', '', '- x', ''].join(NL)
  const body = ['## Added', '', '- a', '## Fixed', '', '- b'].join(NL)
  const out = syncUnreleased(src, body)
  // Both groups carry the SAME bullet text on purpose: the old rule treated a
  // heading as glued only when the bullet it followed was the OTHER one, so
  // with `- a` / `- b` the check passed while `- a### Fixed` was still
  // produced. A repeated bullet makes the assertion catch the real bug.
  const glued = '- a' + NL + '###' + NL + NL + '- a'
  assert.equal(out.includes(glued), false, JSON.stringify(out))
  assert.ok(out.includes('### Added'))
  assert.ok(out.includes('### Fixed'))
  assert.ok(out.includes('## [1.0.0]'))
})
