// BACKLOG.md is parsed by HEADING (`## Pn` sections, `### Xn.` items). A
// fenced code block in an item's body may legitimately CONTAIN such a line
// (an example of the format, a pasted log). Those lines are not headings:
// counting them invented a phantom item with a P0 priority — `/improve`
// picked it over the real backlog, and `backlogStats()` miscounted open items.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBacklogItems, nextBacklogItem } from '../src/commands.ts'
import { backlogStats } from '../src/backlog.ts'

const NL = String.fromCharCode(10)

function sample(): string {
  return [
    '## P2',
    '### C1. real item',
    '',
    '```md',
    '## P0',
    '### A1. fake heading inside code',
    '```',
    '',
    '### C2. another real',
    '',
    '~~~',
    '### D1. also fake (tilde fence)',
    '~~~',
  ].join(NL)
}

test('parseBacklogItems ignores headings inside fenced code blocks', () => {
  const items = parseBacklogItems(sample())
  assert.deepEqual(
    items.map((i) => i.id),
    ['C1', 'C2'],
  )
  assert.equal(items[0].priority, 'P2')
  assert.equal(items[1].priority, 'P2')
})

test('nextBacklogItem never picks a phantom item from a code block', () => {
  assert.equal(nextBacklogItem(parseBacklogItems(sample()))?.id, 'C1')
})

test('backlogStats counts only real items', () => {
  const stats = backlogStats(sample())
  assert.equal(stats.open, 2)
})
