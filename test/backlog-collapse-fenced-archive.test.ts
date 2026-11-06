import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collapseBacklog } from '../src/backlog.ts'

// `collapseBacklog` (/backlog collapse) drops an archive `<details>` block, but
// its "real heading" boundary check does NOT know about FENCED blocks: a
// `### N9.` line inside a ``` example (a note documenting the file format) is
// taken for the end of the archive. `isArchiveBlock` then reports "this is not
// an archive" (no `~~` heading before that boundary) and NOTHING is collapsed —
// the archive stays forever and the size nudge never goes away.

const NL = String.fromCharCode(10)

function doc(): string {
  return [
    '# B',
    '',
    '## P1',
    '',
    '<details><summary>old</summary>',
    '',
    '```',
    '### N9. example inside a fence',
    '```',
    '',
    '### N8. ~~archived item~~',
    '',
    '</details>',
    '',
    '### N10. open',
  ].join(NL)
}

test('a fenced heading inside an archive does not block the collapse', () => {
  const r = collapseBacklog(doc())
  assert.equal(r.changed, true)
  // One <details> archive plus the archived heading it wraps: the
  // collapse counts BOTH (see collapseBacklog).
  assert.equal(r.collapsed, 2)
  assert.equal(r.text.includes('<details'), false)
  assert.ok(r.text.includes('### N10. open'))
})
