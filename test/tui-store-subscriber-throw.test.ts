import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TuiStore } from '../src/tui/store.ts'

// `emit()` calls every subscriber in a bare loop. One subscriber that THROWS
// (a React render error in a log row, a bug in the status bar) aborts the
// loop: the subscribers AFTER it are never notified, so their UI keeps a STALE
// snapshot, and the exception escapes into the agent code that merely printed
// a line. A UI notification must not be able to break the caller or starve the
// other subscribers.

test('a throwing subscriber does not starve the others', () => {
  const s = new TuiStore()
  let called = 0
  s.subscribe(() => {
    throw new Error('render boom')
  })
  s.subscribe(() => {
    called++
  })
  assert.doesNotThrow(() => s.pushLog('system', 'x'))
  assert.equal(called, 1, 'the second subscriber was not notified')
  assert.equal(s.getSnapshot().log.length, 1)
})
