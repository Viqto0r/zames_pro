// A BACKLOG item whose heading has NO title after the id (`### A3. [x]`) must
// still have a usable label: `/improve` picks the highest-priority open item
// and hands its title to the model as the task. An empty title made the task
// text empty, and the marker that made it empty (`[x]`) also marked the item
// DONE, so the item silently disappeared from the pickable list while its
// heading stayed in the file — the operator's note was never worked on.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBacklogItems, nextBacklogItem } from '../src/commands.ts'

const NL = String.fromCharCode(10)

test('a title-less item keeps a non-empty label', () => {
  const items = parseBacklogItems(['## P1', '### A3. [x]'].join(NL))
  assert.equal(items.length, 1)
  assert.ok(items[0].title.trim().length > 0, 'empty title: ' + items[0].title)
})

test('a title-less item does not shadow the next open one', () => {
  const items = parseBacklogItems(
    ['## P1', '### A1. [x]', '### A2. real work'].join(NL),
  )
  const next = nextBacklogItem(items)
  assert.equal(next?.id, 'A2')
})
