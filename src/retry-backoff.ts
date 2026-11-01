// Incremental RETRY BACKOFF — how long to wait before a retry of a
// transient failure (rate limit / server busy / truncated turn / watchdog
// timeout).
//
// WHY: the old per-provider loop had a FIXED pause per family and a hard
// retry ceiling. A long block (DeepSeek answers "too frequent" for minutes)
// then failed the very first retry at the same fixed pause, burned the whole
// budget on cheap retries and surrendered while the block was still active —
// the operator's «лимит повторов исчерпан». Every retry must wait LONGER than
// the previous one (up to a ceiling), and the budget must not run out while
// the server is still asking us to wait.
//
// PURE: the caller owns the counter and the clock; this module only decides
// the next wait and whether the family may be retried again.

export type RetryFamily =
  'rate-limit' | 'server-busy' | 'incomplete' | 'watchdog'

export interface RetryBackoffConfig {
  /** Retry forever (the default): the ceiling only bounds ONE wait. */
  infiniteRetries: boolean
  /** Total attempts allowed when `infiniteRetries` is off (0 = off too). */
  maxRetries: number
  /** Wait before the first retry (ms). */
  baseWaitMs: number
  /** Ceiling for one wait (ms); 0 or Infinity = no ceiling. */
  maxWaitMs: number
}

export const DEFAULT_BACKOFF: RetryBackoffConfig = {
  infiniteRetries: true,
  maxRetries: 6,
  baseWaitMs: 5 * 60_000,
  // Half an hour is where a wait stops being a pause and becomes a dead run:
  // the operator can restart instead of watching a spinner for an hour.
  maxWaitMs: 30 * 60_000,
}

/** A wait never drops below this: a server-busy wait of 0 would retry in a
 *  tight loop against a server that just told us it is overloaded. */
const MIN_WAIT_MS = 500

/** Double on every retry: 5m, 10m, 20m, 30m, 30m, 30m... */
export const BACKOFF_FACTOR = 2

// +/-10% jitter: several agents (or several families in one agent) must not
// retry in the same second and trip the server's burst detector again.
const JITTER_RATIO = 0.1

/** A ceiling of 0 or Infinity means "no ceiling" (a hand-edited config). */
export function normalizeMaxWait(maxWaitMs: number): number {
  return Number.isFinite(maxWaitMs) && maxWaitMs > 0 ? maxWaitMs : 0
}

/** Clamp one wait to the configured ceiling. */
export function clampWait(waitMs: number, maxWaitMs: number): number {
  if (!(Number.isFinite(waitMs) && waitMs > 0)) return 0
  const cap = normalizeMaxWait(maxWaitMs)
  return cap ? Math.min(waitMs, cap) : waitMs
}

/** Shortest acceptable pause. */
export function floorWait(waitMs: number): number {
  if (!(Number.isFinite(waitMs) && waitMs > 0)) return 0
  return Math.max(MIN_WAIT_MS, waitMs)
}

/**
 * PURE: the wait before the next retry, `attempt` being 1-based (1 = the
 * first retry, i.e. after the first failure).
 *
 * `serverWaitMs` (a Retry-After) WINS over the learned curve: when the server
 * names its own pause, guessing a shorter one only burns another attempt.
 * It is still clamped to the ceiling, and it never goes below the curve, so
 * a tiny Retry-After cannot shorten the escalation.
 */
export function backoffWaitMs(
  cfg: RetryBackoffConfig,
  attempt: number,
  opts: { serverWaitMs?: number; jitter?: boolean } = {},
): number {
  const n = Math.max(1, Math.floor(attempt))
  const base =
    Number.isFinite(cfg.baseWaitMs) && cfg.baseWaitMs > 0
      ? cfg.baseWaitMs
      : DEFAULT_BACKOFF.baseWaitMs
  let wait = base * Math.pow(BACKOFF_FACTOR, n - 1)
  if (!Number.isFinite(wait)) wait = Number.MAX_SAFE_INTEGER
  const server = opts.serverWaitMs
  if (typeof server === 'number' && Number.isFinite(server) && server > 0) {
    wait = Math.max(wait, server)
  }
  wait = clampWait(wait, cfg.maxWaitMs)
  if (opts.jitter !== false) {
    const spread = Math.round(wait * JITTER_RATIO)
    if (spread > 0) wait += Math.round((Math.random() * 2 - 1) * spread)
  }
  return Math.max(MIN_WAIT_MS, Math.round(wait))
}

/**
 * PURE: may the family be retried once more after `attemptsMade` failures?
 * With `infiniteRetries` on the answer is always yes — the escalation and
 * the cancel path are what keep an endless wait honest, not a counter.
 */
export function canRetry(
  cfg: RetryBackoffConfig,
  attemptsMade: number,
): boolean {
  if (cfg.infiniteRetries === true) return true
  const max = Math.max(0, Math.floor(cfg.maxRetries))
  if (max === 0) return true
  return attemptsMade < max
}
