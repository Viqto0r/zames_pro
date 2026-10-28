import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nextPhase,
  NET_FINISHED_TICKS,
  DEAD_TURN_TICKS,
  type Observation,
  type TransitionOptions,
} from '../src/ask-state.ts'

// N3: every transition of the ask() state machine that DESIGN-NOTES names as
// a REAL failure. A wrong ORDER here is the "agent stopped" family: the
// stability early-return beating the Continue check returned a partial answer
// with Continue on screen; the context limit checked after the rate limit
// hammered a dead chat; a dead turn waited out a 15-minute timeout.

const obs = (over: Partial<Observation> = {}): Observation => ({
  aborted: false,
  rateLimited: false,
  contextLimit: false,
  serverBusy: false,
  truncated: false,
  noAnswer: false,
  finishedWithAnswer: false,
  continueVisible: false,
  isNew: false,
  hasText: false,
  notGenerating: true,
  sameAsLast: false,
  ...over,
})

const opts = (over: Partial<TransitionOptions> = {}): TransitionOptions => ({
  autoContinue: true,
  deepThinking: true,
  netFinishedTicks: 0,
  deadTicks: 0,
  stableReached: false,
  ...over,
})

test('an abort wins over every detector', () => {
  assert.deepEqual(
    nextPhase('finish', obs({ aborted: true, rateLimited: true }), opts()),
    { kind: 'return', text: 'dom' },
  )
})

test('the context limit is checked BEFORE the rate limit', () => {
  assert.deepEqual(
    nextPhase('start', obs({ contextLimit: true, rateLimited: true }), opts()),
    { kind: 'throw', error: 'context-limit' },
  )
})

test('rate limit and server busy are retryable errors', () => {
  assert.equal(
    nextPhase('start', obs({ rateLimited: true }), opts()).kind,
    'throw',
  )
  assert.deepEqual(nextPhase('finish', obs({ serverBusy: true }), opts()), {
    kind: 'throw',
    error: 'server-busy',
  })
})

test('a truncated turn prefers Continue, then resends', () => {
  assert.deepEqual(
    nextPhase(
      'finish',
      obs({ truncated: true, continueVisible: true }),
      opts(),
    ),
    { kind: 'click-continue' },
  )
  assert.deepEqual(
    nextPhase(
      'finish',
      obs({ truncated: true, continueVisible: false }),
      opts(),
    ),
    { kind: 'throw', error: 'incomplete' },
  )
  // autoContinue OFF: never click, resend instead.
  assert.deepEqual(
    nextPhase(
      'finish',
      obs({ noAnswer: true, continueVisible: true }),
      opts({ autoContinue: false }),
    ),
    { kind: 'throw', error: 'incomplete' },
  )
})

test('a PAUSED generation is never a settled answer', () => {
  // Continue on screen + a stable, new answer: the stability early-return must
  // NOT fire (it used to return the partial text with Continue still visible).
  assert.deepEqual(
    nextPhase(
      'finish',
      obs({ isNew: true, hasText: true, continueVisible: true }),
      opts({ stableReached: true }),
    ),
    { kind: 'click-continue' },
  )
  // Without the reasoning toggle there is no THINK pause: a stable answer is
  // final even if some Continue element lingered.
  assert.deepEqual(
    nextPhase(
      'finish',
      obs({ isNew: true, hasText: true, continueVisible: true }),
      opts({ stableReached: true, deepThinking: false }),
    ),
    { kind: 'return', text: 'dom' },
  )
})

test('FINISHED with an answer returns the network text after the grace window', () => {
  assert.equal(
    nextPhase(
      'finish',
      obs({ finishedWithAnswer: true }),
      opts({ netFinishedTicks: NET_FINISHED_TICKS }),
    ).kind,
    'return',
  )
  assert.deepEqual(
    nextPhase(
      'finish',
      obs({ finishedWithAnswer: true }),
      opts({ netFinishedTicks: 1 }),
    ),
    { kind: 'wait' },
  )
})

test('a dead turn gives up after the grace ticks instead of a long spinner', () => {
  assert.deepEqual(
    nextPhase(
      'finish',
      obs({ finishedWithAnswer: false, notGenerating: true }),
      opts({ deadTicks: DEAD_TURN_TICKS }),
    ),
    { kind: 'throw', error: 'incomplete' },
  )
  // With a Continue button the turn is resumable, not dead.
  assert.deepEqual(
    nextPhase(
      'finish',
      obs({ finishedWithAnswer: false, continueVisible: true }),
      opts({ deadTicks: DEAD_TURN_TICKS }),
    ),
    { kind: 'click-continue' },
  )
})

test('the start loop reports a started generation and accepts a settled one', () => {
  assert.deepEqual(nextPhase('start', obs({ isNew: true }), opts()), {
    kind: 'started',
  })
  assert.deepEqual(
    nextPhase('start', obs({ hasText: true, notGenerating: true }), opts()),
    { kind: 'return', text: 'dom' },
  )
  // Still generating (Stop visible) and no new text yet: keep waiting.
  assert.deepEqual(
    nextPhase('start', obs({ hasText: true, notGenerating: false }), opts()),
    { kind: 'wait' },
  )
})

test('the stable finish returns only when the generation really ended', () => {
  assert.deepEqual(
    nextPhase(
      'finish',
      obs({ isNew: true, notGenerating: true }),
      opts({ stableReached: true }),
    ),
    { kind: 'return', text: 'dom' },
  )
  assert.deepEqual(
    nextPhase(
      'finish',
      obs({ isNew: true, notGenerating: false }),
      opts({ stableReached: true }),
    ),
    { kind: 'wait' },
  )
})
