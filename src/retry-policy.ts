// The retry POLICY of a provider's ask() as a PURE function.
//
// WHY: the three providers ran the same loop — call _askOnce, classify the
// thrown error into a family, retry that family within its own budget — and
// each copy had its own order of checks and its own wording. The loop itself
// (sends, throttling, aborts) stays in the browser class; only the DECISION is
// here, so every branch is unit-tested without a browser.
//
// Incremental retries (default): the three transient families (and the
// agent-loop watchdog) no longer count their attempts; the WAIT grows from the
// family's base (rate limit: 5m, busy: 3s, incomplete: 2s) up to the ceiling
// (browser.maxRetryWaitMs, default 30m), and the only way out is a cancel
// (Esc/Ctrl+C) or a FATAL error (bad login, captcha, guest limit) — the same
// place it was before.
//
// One thing matters for understanding this module: a retry that waits the
// SAME fixed pause forever is not endless, it is a busy loop that never lets
// the block expire. The escalation is what makes "infinite" safe.

import {
  backoffWaitMs,
  canRetry,
  type RetryBackoffConfig,
} from './retry-backoff.js'

export type RetryFamily =
  | 'rate-limit'
  | 'server-busy'
  | 'incomplete'
  | 'context-limit'
  | 'fatal'
  | 'generic'

export interface RetryBudgets {
  /** Total attempts of the generic loop (askRetries). */
  askRetries: number
  /** Counted ceiling for the transient families (ignored when
   *  infiniteRetries is on). */
  maxRateLimitRetries: number
  maxServerBusyRetries: number
  maxIncompleteRetries: number
  /** Always counted: a compaction that frees nothing is not a transient
   *  hiccup, so this budget stays independent of the retry mode. */
  maxContextLimitRetries: number
}

export interface RetryState {
  /** 0-based index of the attempt that just failed. */
  attempt: number
  rateLimitRetries: number
  serverBusyRetries: number
  incompleteRetries: number
  contextLimitRetries: number
}

export type RetryDecision =
  /** Retry the SAME prompt after a pause of waitMs. */
  | { kind: 'wait'; family: RetryFamily; waitMs: number }
  /** The context limit was hit: compact into a fresh chat and resend. */
  | { kind: 'compact'; family: RetryFamily }
  /** Consume a generic attempt after a short back-off. Still counted even in
   *  the infinite mode, because a generic failure is not transient by nature. */
  | { kind: 'generic'; waitMs: number }
  /** Give up (fatal, a counted family with a reached ceiling, or the generic
   *  budget exhausted). */
  | { kind: 'give-up'; family: RetryFamily }

export interface RetryWaits {
  rateLimitMs: number
  serverBusyMs: number
  incompleteMs: number
  /** Retry-After of the failed send, if the server sent one. */
  retryAfterMs?: number
}

/**
 * Decide what to do after a failed attempt.
 *
 * classify maps the thrown error to a family; it lives in the provider
 * because the backend-specific markers (guest limit, age gate, captcha) are
 * provider knowledge. A null classification falls through to the generic
 * attempt budget.
 *
 * backoff carries the retry mode (infiniteRetries, the ceiling) — see
 * src/retry-backoff.ts.
 */
export function decideRetry(
  family: RetryFamily | null,
  state: RetryState,
  budgets: RetryBudgets,
  waits: RetryWaits,
  backoff?: RetryBackoffConfig,
  opts: { jitter?: boolean } = {},
): RetryDecision {
  // Strict === true: the infinite mode is opt-in by an EXPLICIT config field.
  // A caller that omits it keeps the historical counted budget, so a
  // partially built config can never silently retry forever.
  const infinite = backoff?.infiniteRetries === true // strict
  const cfg: RetryBackoffConfig = {
    infiniteRetries: infinite,
    maxRetries: backoff?.maxRetries ?? 6,
    baseWaitMs: waits.rateLimitMs,
    maxWaitMs: backoff?.maxWaitMs ?? 0,
  }
  // The cause of a transient failure decides the FIRST wait — a rate block is
  // waited out for minutes, a transient busy notice for seconds — and the
  // escalation adds to it from there.
  const baseWait = (f: RetryFamily): number =>
    f === 'server-busy'
      ? waits.serverBusyMs
      : f === 'incomplete'
        ? waits.incompleteMs
        : waits.rateLimitMs
  const waitFor = (f: RetryFamily, attempts: number): number =>
    backoffWaitMs({ ...cfg, baseWaitMs: baseWait(f) }, attempts, {
      // A server Retry-After is the best clock we have; it is still clamped
      // to the ceiling and never shortens the escalation.
      serverWaitMs: f === 'rate-limit' ? waits.retryAfterMs : undefined,
      jitter: opts.jitter,
    })
  switch (family) {
    case 'fatal':
      return { kind: 'give-up', family }
    case 'context-limit':
      if (state.contextLimitRetries >= budgets.maxContextLimitRetries) {
        return { kind: 'give-up', family }
      }
      return { kind: 'compact', family }
    case 'rate-limit':
      if (!canRetry(cfg, state.rateLimitRetries)) {
        return { kind: 'give-up', family }
      }
      return {
        kind: 'wait',
        family,
        waitMs: waitFor('rate-limit', state.rateLimitRetries + 1),
      }
    case 'server-busy':
      if (!canRetry(cfg, state.serverBusyRetries)) {
        return { kind: 'give-up', family }
      }
      return {
        kind: 'wait',
        family,
        waitMs: waitFor('server-busy', state.serverBusyRetries + 1),
      }
    case 'incomplete':
      if (!canRetry(cfg, state.incompleteRetries)) {
        return { kind: 'give-up', family }
      }
      return {
        kind: 'wait',
        family,
        waitMs: waitFor('incomplete', state.incompleteRetries + 1),
      }
    default:
      // A generic failure is retried while the TOTAL attempt budget lasts.
      if (state.attempt >= budgets.askRetries - 1) {
        return { kind: 'give-up', family: 'generic' }
      }
      return { kind: 'generic', waitMs: 2000 * (state.attempt + 1) }
  }
}
