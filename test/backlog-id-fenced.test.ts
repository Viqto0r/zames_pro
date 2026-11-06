import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextBacklogId, appendBacklogItem } from '../src/backlog.ts'

// The backlog id generator scans `### N<digits>.` at the start of a line —
// including inside a FENCED code block. A note that documents the file format
// (`### N99. example` in a ``` block) inflates the next id: the operator gets
// `### N100.` right after `### N1.`, and the jump looks like 98 lost items.
// The APPEND path already skips fenced headings when it places an item; the id
// generator must use the same rule.

const NL = String.fromCharCode(10)

function doc(): string {
  return (
    '# B' +
    NL +
    NL +
    '## P1' +
    NL +
    NL +
    '### N1. real' +
    NL +
    NL +
    '```' +
    NL +
    '### N99. example' +
    NL +
    '```' +
    NL
  )
}

test('an id inside a fenced block is not counted', () => {
  assert.equal(nextBacklogId(doc()), 'N2')
})

test('appending uses the same id the operator is shown', () => {
  const res = appendBacklogItem(doc(), { title: 'new', priority: 'P1' })
  assert.equal(res.id, 'N2')
  assert.ok(res.text.includes('### N2. new'))
})

test('a real heading still advances the counter', () => {
  assert.equal(nextBacklogId('### N7. x' + NL + '### N3. y'), 'N8')
})
