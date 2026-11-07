import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// The status badges are the operator's only view of the session state. They are
// PURE reads of the injected query callbacks (no terminal write), so they can
// be pinned without driving the editor. A THROWING callback must hide its badge
// and never break the render — a broken hook once blanked the whole status
// line.

test('the queue badge is empty when idle and carries the count otherwise', () => {
  const e = new LineEditor()
  assert.equal(e._queueBadge(), '')
  e.onQueueQuery = () => 3
  assert.match(e._queueBadge(), /3/)
})

test('a negative or non-numeric queue length hides the badge', () => {
  const e = new LineEditor()
  e.onQueueQuery = () => -1
  assert.equal(e._queueBadge(), '')
})

test('a throwing queue callback hides the badge instead of crashing', () => {
  const e = new LineEditor()
  e.onQueueQuery = () => {
    throw new Error('boom')
  }
  assert.equal(e._queueBadge(), '')
})

test('the tasks badge shows the injected summary and hides when empty', () => {
  const e = new LineEditor()
  assert.equal(e._tasksBadge(), '')
  e.onTasksQuery = () => 'tasks: 2/5'
  assert.match(e._tasksBadge(), /2\/5/)
  e.onTasksQuery = () => ''
  assert.equal(e._tasksBadge(), '')
})

test('a throwing tasks callback hides the badge', () => {
  const e = new LineEditor()
  e.onTasksQuery = () => {
    throw new Error('boom')
  }
  assert.equal(e._tasksBadge(), '')
})

test('the provider badge shows the active backend and hides when unset', () => {
  const e = new LineEditor()
  assert.equal(e._providerBadge(), '')
  e.setProvider('Qwen')
  assert.match(e._providerBadge(), /Qwen/)
})

test('the statusLine badge shows the hook text and hides when empty', () => {
  const e = new LineEditor()
  assert.equal(e._statusLineBadge(), '')
  e.setStatusLine('build ok')
  assert.match(e._statusLineBadge(), /build ok/)
  e.setStatusLine('')
  assert.equal(e._statusLineBadge(), '')
})

test('an unknown token count renders no context text', () => {
  const e = new LineEditor()
  e.setContextStatus(null)
  assert.equal(e._contextText(), '')
})

test('the context text repeats the fill level as a text marker', () => {
  const e = new LineEditor()
  // The thresholds are percentages of the USABLE window: red from 80%,
  // yellow from 50%.
  e.setContextLimit(100)
  e.setContextStatus(95)
  const high = e._contextText()
  e.setContextStatus(60)
  const warn = e._contextText()
  e.setContextStatus(10)
  const ok = e._contextText()
  // The markers survive on a terminal without color and for a color-blind
  // operator: the LEVEL is in the text, not only in the color.
  assert.match(high, /⛔/)
  assert.match(warn, /▲/)
  assert.equal(/⛔|▲/.test(ok), false)
})

test('the toggle icons show only the ENABLED toggles', () => {
  const e = new LineEditor()
  e.thinkingEnabled = false
  e.searchEnabled = false
  assert.equal(e._toggleIcons(), '')
  e.thinkingEnabled = true
  assert.match(e._toggleIcons(), /🧠/)
  e.searchEnabled = true
  const both = e._toggleIcons()
  assert.match(both, /🧠/)
  assert.match(both, /🌐/)
})

test('_refreshToggles reads the injected callback and survives a throw', () => {
  const e = new LineEditor()
  e.onToggleQuery = () => ({ deepThinking: true, webSearch: false })
  e._refreshToggles()
  assert.equal(e.thinkingEnabled, true)
  assert.equal(e.searchEnabled, false)
  e.onToggleQuery = () => {
    throw new Error('boom')
  }
  assert.doesNotThrow(() => e._refreshToggles())
  // The previous state survives a broken callback.
  assert.equal(e.thinkingEnabled, true)
})
