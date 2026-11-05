import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCycleLoopLine,
  isLoopCycle,
  LOOP_CYCLES,
  DEFAULT_LOOP_INTERVAL,
} from '../src/loop-prompts.ts'
import { DEV_ONLY_COMMANDS } from '../src/commands.ts'

// The /loop cycles are DEV-ONLY and every one of them must be an actual
// `/loop <interval> <task>` line: a body that does not start with `/loop`
// would just run once and the scheduler would never be armed.

test('every cycle expands into a /loop line with the interval first', () => {
  for (const id of LOOP_CYCLES) {
    const line = buildCycleLoopLine(id)
    assert.ok(line, id + ' produced no line')
    assert.match(line, /^\/loop 5m /, id + ' does not start with /loop 5m')
  }
})

test('an explicit interval replaces the default one', () => {
  const line = buildCycleLoopLine('bughunt', '10m')
  assert.match(String(line), /^\/loop 10m Bug hunt/)
})

// Why this matters: the scheduler reads the FIRST token as the interval, so an
// interval containing whitespace silently turns into garbage task text and the
// loop is never created.

test('whitespace in the interval cannot split the command', () => {
  const line = buildCycleLoopLine('coverage', ' 5 m ')
  assert.match(String(line), /^\/loop 5m Coverage step/)
})

test('an empty interval falls back to the default', () => {
  const line = buildCycleLoopLine('dumps', '   ')
  assert.match(
    String(line),
    new RegExp('^/loop ' + DEFAULT_LOOP_INTERVAL + ' '),
  )
})

test('an unknown cycle produces no line', () => {
  assert.equal(buildCycleLoopLine('nope'), null)
  assert.equal(isLoopCycle('nope'), false)
  assert.equal(isLoopCycle('Bughunt'), true)
})

// The guard the operator asked for: a regular npm user must never see these.

test('every cycle is a dev-only command', () => {
  for (const id of LOOP_CYCLES) {
    assert.ok(
      DEV_ONLY_COMMANDS.includes('/' + id),
      '/' + id + ' is missing from DEV_ONLY_COMMANDS',
    )
  }
})
