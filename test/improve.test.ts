import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseBacklogItems,
  nextBacklogItem,
  buildImprovePrompt,
} from '../src/commands.ts'

const SAMPLE = [
  '## P0 — bugs',
  '',
  '### A1. [x] fixed thing',
  '',
  '<details><summary>old</summary>',
  '',
  '### A1. ~~fixed thing~~',
  '',
  '</details>',
  '',
  '### A2. still broken',
  '',
  '## P1 — nice',
  '',
  '### B1. a feature',
  '',
].join(String.fromCharCode(10))

test('parseBacklogItems recognizes ids, priorities and done markers', () => {
  const items = parseBacklogItems(SAMPLE)
  const a1 = items.find((i) => i.id === 'A1')
  const a2 = items.find((i) => i.id === 'A2')
  const b1 = items.find((i) => i.id === 'B1')
  assert.ok(a1 && a2 && b1)
  assert.equal(a1.status, 'done')
  assert.equal(a2.status, 'open')
  assert.equal(a2.priority, 'P0')
  assert.equal(b1.priority, 'P1')
})

test('parseBacklogItems strips the [x] marker and strike-through', () => {
  const items = parseBacklogItems(SAMPLE)
  const a1 = items.find((i) => i.id === 'A1')
  assert.equal(a1?.title, 'fixed thing')
})

test('nextBacklogItem picks the highest-priority OPEN item', () => {
  const items = parseBacklogItems(SAMPLE)
  const next = nextBacklogItem(items)
  assert.equal(next?.id, 'A2')
})

test('nextBacklogItem honors an explicit id even if it is done', () => {
  const items = parseBacklogItems(SAMPLE)
  assert.equal(nextBacklogItem(items, 'a1')?.id, 'A1')
  assert.equal(nextBacklogItem(items, 'b1')?.id, 'B1')
})

test('nextBacklogItem returns null when everything is done', () => {
  const allDone = ['### A1. [x] one', '### A2. [x] two'].join(
    String.fromCharCode(10),
  )
  assert.equal(nextBacklogItem(parseBacklogItems(allDone)), null)
})

test('buildImprovePrompt mentions the id, the tests and no-commit rule', () => {
  const items = parseBacklogItems(SAMPLE)
  const p = buildImprovePrompt(items.find((i) => i.id === 'A2')!)
  assert.ok(p.includes('A2'))
  assert.ok(p.includes('npm test'))
  assert.ok(/do NOT commit/i.test(p))
  assert.ok(p.includes('BACKLOG.md'))
})
