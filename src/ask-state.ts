// N3: the PHASE DECISION of DeepSeek's `_askOnce()` as a pure state machine.
//
// `_askOnce` (src/browser.ts) is the most fragile function of the project: a
// start-wait loop, a finish loop, the Continue button, the stability window
// and four detectors (rate limit / context limit / truncated / finished
// without answer). Until now it was covered only by live smoke runs, and a
// wrong ordering of the checks kept reappearing (the "Stopped" hang, the
// "agent stopped with a Continue button", the 15-minute spinner on a dead
// turn). The Playwright part keeps COLLECTING an observation; the TRANSITION
// below is pure and unit-tested against the real cases from DESIGN-NOTES.

/** What one poll of the page/network saw. */
export interface Observation {
  /** Esc / a cancelled ask. */
  aborted: boolean
  /** A rate-limit toast or a rate-limit marker in the raw body. */
  rateLimited: boolean
  /** The "Length limit reached" notice — the chat can never accept a send. */
  contextLimit: boolean
  /** A transient server-busy notice. */
  serverBusy: boolean
  /** The raw SSE body says the turn was truncated (generation_err / INCOMPLETE). */
  truncated: boolean
  /** The raw SSE body says FINISHED but produced no answer (only reasoning). */
  noAnswer: boolean
  /** The raw SSE body says FINISHED WITH a RESPONSE fragment. */
  finishedWithAnswer: boolean
  /** A Continue button is on screen (a PAUSED generation). */
  continueVisible: boolean
  /** The rendered answer differs from the pre-send text. */
  isNew: boolean
  /** The rendered answer is non-empty. */
  hasText: boolean
  /** No Stop button: the generation has ended (or never started). */
  notGenerating: boolean
  /** The answer is identical to the last tick (a stability tick). */
  sameAsLast: boolean
}

export type Phase = 'start' | 'finish'

export type Transition =
  | { kind: 'wait' }
  | { kind: 'click-continue' }
  | { kind: 'started' }
  | { kind: 'return'; text: 'dom' | 'net' }
  | { kind: 'throw'; error: 'rate-limit' | 'context-limit' | 'server-busy' }
  | { kind: 'throw'; error: 'incomplete' }
  | { kind: 'throw'; error: 'no-start' | 'no-answer' }

export interface TransitionOptions {
  /** Continue auto-click is enabled (`browser.autoContinue`). */
  autoContinue: boolean
  /** The reasoning toggle is on (the THINK-phase pause only happens then). */
  deepThinking: boolean
  /** Consecutive ticks with FINISHED+answer (the grace window, default 2). */
  netFinishedTicks: number
  /** Consecutive ticks on a dead turn (FINISHED without an answer). */
  deadTicks: number
  /** The stability window reached (`stabilityChecks - 1`). */
  stableReached: boolean
}

/** Grace ticks before a FINISHED-with-answer turn is returned (default 2). */
export const NET_FINISHED_TICKS = 2
/** Ticks a dead (FINISHED, no answer, no Continue) turn waits before giving up. */
export const DEAD_TURN_TICKS = 6

/**
 * One transition of the ask() state machine.
 *
 * ORDER MATTERS and is the whole point of this function:
 *  1. an abort wins over everything (the operator stopped);
 *  2. the CONTEXT limit is checked BEFORE the rate limit — both look like a
 *     toast, and retrying an exhausted chat is useless;
 *  3. rate limit / server busy are retryable errors;
 *  4. a truncated turn PREFERS the Continue button (it RESUMES the turn) and
 *     only falls back to a resend when there is no button;
 *  5. a PAUSED generation (`continueVisible`) is never "settled": the
 *     stability early-return must be checked AFTER it, otherwise a partial
 *     answer is returned with Continue still on screen.
 */
export function nextPhase(
  phase: Phase,
  o: Observation,
  opts: TransitionOptions,
): Transition {
  if (o.aborted) return { kind: 'return', text: 'dom' }
  if (o.contextLimit) return { kind: 'throw', error: 'context-limit' }
  if (o.rateLimited) return { kind: 'throw', error: 'rate-limit' }
  if (o.serverBusy) return { kind: 'throw', error: 'server-busy' }

  // A truncated / answer-less turn: click Continue when possible (it resumes
  // the SAME turn); otherwise resend.
  if (o.truncated || o.noAnswer) {
    if (opts.autoContinue && o.continueVisible) {
      return { kind: 'click-continue' }
    }
    return { kind: 'throw', error: 'incomplete' }
  }

  if (phase === 'start') {
    if (o.isNew) return { kind: 'started' }
    if (o.hasText && o.notGenerating && !o.continueVisible) {
      return { kind: 'return', text: 'dom' }
    }
    // A reasoning pause during the THINK phase: click Continue so the answer
    // starts flowing instead of waiting for the start deadline.
    if (opts.autoContinue && opts.deepThinking && o.continueVisible) {
      return { kind: 'click-continue' }
    }
    return { kind: 'wait' }
  }

  // --- finish loop ---------------------------------------------------------
  // The SSE body is ground truth: FINISHED with an answer, after a short grace
  // window, is complete.
  if (o.finishedWithAnswer && opts.netFinishedTicks >= NET_FINISHED_TICKS) {
    return { kind: 'return', text: 'net' }
  }
  // A dead turn (the server ended it with nothing and there is no Continue to
  // resume): give up quickly so ask() resends instead of a long spinner.
  if (opts.deadTicks >= DEAD_TURN_TICKS && !o.continueVisible) {
    return { kind: 'throw', error: 'incomplete' }
  }
  // A PAUSED generation looks stable: check it BEFORE the stability return.
  if (opts.autoContinue && opts.deepThinking && o.continueVisible) {
    return { kind: 'click-continue' }
  }
  if (o.isNew && opts.stableReached) {
    if (o.notGenerating) return { kind: 'return', text: 'dom' }
    return { kind: 'wait' }
  }
  return { kind: 'wait' }
}
