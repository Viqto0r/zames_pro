// Unit tests for the TUI store (src/tui/store.ts) — the bridge between the
// imperative agent and the React tree. Verifies the subscription/notification
// contract (useSyncExternalStore relies on a STABLE snapshot between changes)
// and the log-append helpers.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TuiStore } from '../src/tui/store.js'

test('store: getSnapshot стабилен без изменений', () => {
  const s = new TuiStore()
  const a = s.getSnapshot()
  const b = s.getSnapshot()
  assert.equal(a, b, 'the same object while nothing changed')
})

test('store: set создаёт новый снапшот и уведомляет', () => {
  const s = new TuiStore()
  let calls = 0
  const unsub = s.subscribe(() => calls++)
  const before = s.getSnapshot()
  s.set({ busy: true })
  assert.notEqual(s.getSnapshot(), before)
  assert.equal(s.getSnapshot().busy, true)
  assert.equal(calls, 1)
  unsub()
})

test('store: set с тем же значением не уведомляет', () => {
  const s = new TuiStore()
  let calls = 0
  s.subscribe(() => calls++)
  s.set({ busy: false })
  assert.equal(calls, 0, 'no change -> no notification')
})

test('store: pushLog добавляет запись с уникальным id', () => {
  const s = new TuiStore()
  s.pushLog('user', 'hello')
  s.pushLog('assistant', 'hi')
  const log = s.getSnapshot().log
  assert.equal(log.length, 2)
  assert.notEqual(log[0].id, log[1].id)
  assert.equal(log[0].kind, 'user')
  assert.equal(log[1].text, 'hi')
})

test('store: pushLogs добавляет пачку за одно уведомление', () => {
  const s = new TuiStore()
  let calls = 0
  s.subscribe(() => calls++)
  s.pushLogs([
    { kind: 'system', text: 'a' },
    { kind: 'system', text: 'b' },
  ])
  assert.equal(s.getSnapshot().log.length, 2)
  assert.equal(calls, 1, 'one notification for the whole batch')
})

test('store: update через функцию', () => {
  const s = new TuiStore()
  s.update((st) => ({ queueLength: st.queueLength + 1 }))
  assert.equal(s.getSnapshot().queueLength, 1)
})
