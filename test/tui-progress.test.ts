// Unit tests for the pure task-progress helpers (src/tui/progress.ts).
// The status bar shows a small bar next to the localized "tasks: n/m" summary;
// the parsing must be locale-independent and the bar always `width` cells.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTaskProgress,
  renderProgressBar,
} from '../src/tui/progress.ts'

test('parseTaskProgress: reads n/m from an English and a Russian summary', () => {
  assert.deepEqual(parseTaskProgress('tasks: 3/5'), { done: 3, total: 5 })
  assert.deepEqual(parseTaskProgress('задачи: 2/4'), { done: 2, total: 4 })
})

test('parseTaskProgress: no pair -> null', () => {
  assert.equal(parseTaskProgress(''), null)
  assert.equal(parseTaskProgress('tasks'), null)
  assert.equal(parseTaskProgress('tasks: 0/0'), null)
})

test('parseTaskProgress: clamps done to total', () => {
  assert.deepEqual(parseTaskProgress('9/5'), { done: 5, total: 5 })
})

test('renderProgressBar: fixed width, full/empty/half', () => {
  assert.equal(renderProgressBar({ done: 0, total: 5 }, 5), '░░░░░')
  assert.equal(renderProgressBar({ done: 5, total: 5 }, 5), '▓▓▓▓▓')
  assert.equal(renderProgressBar({ done: 1, total: 2 }, 5), '▓▓▓░░')
})

test('renderProgressBar: never shows full before the work is done', () => {
  assert.equal(renderProgressBar({ done: 4, total: 5 }, 5), '▓▓▓▓░')
})

test('renderProgressBar: a started list shows at least one cell', () => {
  assert.equal(renderProgressBar({ done: 1, total: 100 }, 5), '▓░░░░')
})

test('renderProgressBar: null / zero width -> empty', () => {
  assert.equal(renderProgressBar(null, 5), '')
  assert.equal(renderProgressBar({ done: 1, total: 2 }, 0), '')
})
