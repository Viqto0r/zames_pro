// Adaptive SEND THROTTLE — how long to wait before the next agent send.
//
// WHY: a fixed interval is wrong in both directions. Too small and the site
// answers with a rate limit whose PENALTY grows with the overrun (DeepSeek: a
// zero-gap burst ran ~30 min, then a ~30 min block). Too large and every turn
// pays a pause that is usually unnecessary. The throttle learns from the
// telemetry: it stays below a soft budget, backs off on a real limit and
// recovers gradually after a run of successes.
//
// The module is PURE: it takes the current state and one event and returns the
// next state + the wait. The browser owns the state, so switching providers or
// finishing a task does not reset what was learned.

import type { SendEvent } from './send-telemetry.js'

export interface ThrottleConfig {
  /** The operator's base interval (ms) for this provider. */
  baseMs: number
  /** Pause after a rate limit that carries no explicit Retry-After (ms). */
  rateLimitWaitMs: number
  /**
   * Soft window budget: when MORE than `budget` sends happened in the last
   * `windowMs`, the interval grows smoothly BEFORE a limit is hit. Infinity
   * keeps this step off until real data exists.
   */
  windowMs: number
  budget: number
  /** Successes in a row before the interval is halved (K). */
  recoverAfter: number
  /** Ceiling for the adaptive interval (ms). */
  maxMs: number
  /** Floor added after a limit: max(base, 2 s). */
  limitFloorMs: number
}

export interface ThrottleState {
  /** The interval currently in force (ms). */
  intervalMs: number
  /** Consecutive successful sends since the last limit. */
  okStreak: number
  /** True while a rate-limit block is believed to be active. */
  blocked: boolean
  /** When the block started (epoch ms), 0 when not blocked. */
  blockedAt: number
  /** Pending forced wait from a Retry-After header (ms). */
  forcedWaitMs: number
  /** When the forced wait was requested (epoch ms); 0 = none. */
  forcedWaitAt?: number
  /** Timestamps (epoch ms) of the recent sends, for the soft budget. */
  recent: number[]
}

export const DEFAULT_THROTTLE: Omit<
  ThrottleConfig,
  'baseMs' | 'rateLimitWaitMs'
> = {
  windowMs: 10 * 60_000,
  // Off until the operator has data: an infinite budget never fires.
  budget: Number.POSITIVE_INFINITY,
  recoverAfter: 3,
  maxMs: 60_000,
  limitFloorMs: 2000,
}

export function initialThrottleState(cfg: ThrottleConfig): ThrottleState {
  return {
    intervalMs: Math.max(0, cfg.baseMs),
    okStreak: 0,
    blocked: false,
    blockedAt: 0,
    forcedWaitMs: 0,
    recent: [],
  }
}

/** Drop sends older than the window (keeps the state small). */
function prune(recent: number[], now: number, windowMs: number): number[] {
  return recent.filter((t) => now - t <= windowMs)
}

/**
 * PURE: the wait before the next send, given the state and `now`. A blocked
 * throttle waits out the forced pause; otherwise the learned interval applies
 * since the last send.
 */
export function nextWaitMs(
  state: ThrottleState,
  lastSentAt: number,
  now: number,
): number {
  if (state.forcedWaitMs > 0) {
    // A forced wait must EXPIRE: a long Retry-After used to block every
    // send forever (the check was `> 0` only), until another event cleared
    // it. With the request stamp the remaining time is exact; without one
    // (a caller-built or restored state) the wait is reported ONCE, from
    // the current call, and expires on the next.
    if (state.forcedWaitAt) {
      const left = state.forcedWaitMs - (now - state.forcedWaitAt)
      return left > 0 ? left : 0
    }
    return state.forcedWaitMs
  }
  if (!lastSentAt) return 0
  const gap = state.intervalMs - (now - lastSentAt)
  return gap > 0 ? gap : 0
}

/**
 * PURE: fold one telemetry event into the state.
 *
 * Rules (the operator's strategy):
 *  - a soft budget: too many sends in the window GROW the interval smoothly,
 *    ahead of a ban;
 *  - a rate limit: wait the server's own Retry-After when present, else the
 *    configured pause; after it lifts the interval doubles (from a floor);
 *  - after `recoverAfter` successes in a row the interval halves, down to the
 *    base.
 */
export function applySendEvent(
  state: ThrottleState,
  event: SendEvent,
  cfg: ThrottleConfig,
  now = Date.now(),
): ThrottleState {
  const next: ThrottleState = { ...state, recent: [...state.recent] }
  const at = Date.parse(event.at)
  const stamp = Number.isFinite(at) ? at : now

  if (event.outcome === 'ok') {
    next.recent.push(stamp)
    next.recent = prune(next.recent, now, cfg.windowMs)
    next.okStreak = state.okStreak + 1
    if (next.okStreak >= cfg.recoverAfter) {
      next.intervalMs = Math.max(cfg.baseMs, Math.floor(next.intervalMs / 2))
      next.okStreak = 0
    }
    next.blocked = false
    next.blockedAt = 0
    next.forcedWaitMs = 0
  } else if (event.outcome === 'rate_limit') {
    next.blocked = true
    next.blockedAt = state.blocked ? state.blockedAt || stamp : stamp
    next.okStreak = 0
    next.forcedWaitMs =
      typeof event.retryAfterMs === 'number' &&
      Number.isFinite(event.retryAfterMs) &&
      event.retryAfterMs > 0
        ? // A server may send a Retry-After of DAYS (`86400`); waiting it out
          // verbatim froze the agent, which the operator sees as a dead run.
          // Bound it by the same ceiling as the learned interval — a longer
          // block is not worth sitting through silently, the next send can
          // try again.
          Math.min(event.retryAfterMs, cfg.maxMs)
        : cfg.rateLimitWaitMs
    next.forcedWaitAt = now
    const floor = Math.max(cfg.baseMs, cfg.limitFloorMs)
    next.intervalMs = Math.min(cfg.maxMs, Math.max(next.intervalMs, floor) * 2)
  } else {
    // busy / incomplete / guest_limit: not a rate signal, keep the interval.
    next.recent.push(stamp)
    next.recent = prune(next.recent, now, cfg.windowMs)
  }

  // Soft budget: a smooth growth once the window is over budget.
  if (Number.isFinite(cfg.budget) && next.recent.length > cfg.budget) {
    const over = next.recent.length - cfg.budget
    next.intervalMs = Math.min(
      cfg.maxMs,
      Math.max(next.intervalMs, cfg.baseMs) + over * 1000,
    )
  }

  return next
}

/**
 * PURE: a rate limit was observed and the block ended — record its duration on
 * the event so the telemetry can average it.
 */
export function withBlockDuration(
  event: SendEvent,
  blockedAt: number,
  liftedAt: number,
): SendEvent {
  if (event.outcome !== 'rate_limit') return event
  if (!blockedAt) return event
  return { ...event, blockMs: Math.max(0, liftedAt - blockedAt) }
}
