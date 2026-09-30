import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ctrlCEscalation } from '../src/commands.ts'

// While the agent is busy, the FIRST Ctrl+C aborts the running tool; a
// SECOND press within 2s stops the whole run (including the queue).

test('a fresh Ctrl+C aborts just the tool', () => {
  assert.equal(ctrlCEscalation(Infinity), 'tool')
  assert.equal(ctrlCEscalation(5000), 'tool')
  assert.equal(ctrlCEscalation(2001), 'tool')
})

test('a second Ctrl+C within the window stops the whole run', () => {
  assert.equal(ctrlCEscalation(0), 'run')
  assert.equal(ctrlCEscalation(1999), 'run')
  assert.equal(ctrlCEscalation(1000), 'run')
})

test('the window is configurable', () => {
  assert.equal(ctrlCEscalation(3000, 5000), 'run')
  assert.equal(ctrlCEscalation(3000, 1000), 'tool')
})
