import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  swallow,
  noteSwallowed,
  swallowedReport,
  resetSwallowed,
} from '../src/swallow.ts'

// N7: a swallowed failure must be COUNTED (and printable in debug mode)
// instead of vanishing. /doctor surfaces the top tags, so a selector that
// broke after a redesign stops being invisible.

test('swallow returns the fallback and counts the failure', async () => {
  resetSwallowed()
  const v = await swallow(
    'probe',
    () => {
      throw new Error('boom')
    },
    42,
  )
  assert.equal(v, 42)
  assert.deepEqual(swallowedReport(), [{ tag: 'probe', count: 1 }])
})

test('swallow returns the value when nothing fails', async () => {
  resetSwallowed()
  assert.equal(await swallow('probe', () => 'ok', 'fallback'), 'ok')
  assert.deepEqual(swallowedReport(), [])
})

test('noteSwallowed counts by tag and the report sorts by count', () => {
  resetSwallowed()
  noteSwallowed('a')
  noteSwallowed('b')
  noteSwallowed('b')
  noteSwallowed('b')
  assert.deepEqual(swallowedReport(), [
    { tag: 'b', count: 3 },
    { tag: 'a', count: 1 },
  ])
})

test('the report is capped by the limit', () => {
  resetSwallowed()
  for (const t of ['a', 'b', 'c', 'd']) noteSwallowed(t)
  assert.equal(swallowedReport(2).length, 2)
})

test('debug mode prints the failure, silent mode does not', () => {
  resetSwallowed()
  const orig = console.error
  const lines: string[] = []
  console.error = (l: string) => void lines.push(String(l))
  try {
    noteSwallowed('silent', new Error('x'), false)
    noteSwallowed('loud', new Error('x'), true)
  } finally {
    console.error = orig
  }
  assert.equal(lines.length, 1)
  assert.match(lines[0], /^\[swallowed\] loud/)
})
