// appendBacklogItem() writes `### <id>. <title>`. The title comes from the
// operator's `/backlog <text>` (arbitrary text): a NEWLINE in it injected a
// fake heading into the file, so the item list gained a phantom entry and the
// next id could collide with it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendBacklogItem } from '../src/backlog.ts'

const NL = String.fromCharCode(10)

test('a title with a newline does not inject a fake heading', () => {
  const base = '# B' + NL + NL + '## P1' + NL
  const { text } = appendBacklogItem(base, {
    title: 'line1' + NL + '### N99. fake',
    priority: 'P1',
  })
  assert.ok(
    !text.includes(NL + '### N99.'),
    'a fake heading was injected: ' + JSON.stringify(text),
  )
})

test('an ordinary title is unchanged (control)', () => {
  const base = '# B' + NL + NL + '## P1' + NL
  const { text, id } = appendBacklogItem(base, {
    title: 'real fix',
    priority: 'P1',
  })
  assert.equal(id, 'N1')
  assert.ok(text.includes('### N1. real fix'))
})
