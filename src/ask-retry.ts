// N1 stage 4: the retry POLICY of a provider's `ask()` as a PURE function.
//
// The three providers ran the same loop — call `_askOnce`, classify the thrown
// error into a family (rate limit / server busy / incomplete / context limit /
// provider-specific fatal), retry that family within its own budget, otherwise
// fall through to a generic attempt counter — and each copy had its own order
// of checks and its own wording. The loop itself (sends, throttling, aborts)
// stays in the browser class; only the DECISION is here, so every branch is
// unit-tested without a browser.

export type RetryFamily =
  | 'rate-limit'
  | 'server-busy'
  | 'incomplete'
  | 'context-limit'
  | 'fatal'
  | 'generic'

export interface RetryBudgets {
  /** Total attempts of the generic loop (`askRetries`). */
  askRetries: number
  maxRateLimitRetries: number
  maxServerBusyRetries: number
  maxIncompleteRetries: number
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
  /** Retry the SAME prompt after a pause of `waitMs`. */
  | { kind: 'wait'; family: RetryFamily; waitMs: number }
  /** The context limit was hit: compact into a fresh chat and resend. */
  | { kind: 'compact'; family: RetryFamily }
  /** Consume a generic attempt after a short back-off. */
  | { kind: 'generic'; waitMs: number }
  /** Give up (the budget of this family is exhausted). */
  | { kind: 'give-up'; family: RetryFamily }

/**
 * Decide what to do after a failed attempt.
 *
 * `classify` maps the thrown error to a family; it lives in the provider
 * because the backend-specific markers (guest limit, age gate, captcha) are
 * provider knowledge. A `null` classification falls through to the generic
 * attempt budget.
 */
export function decideRetry(
  family: RetryFamily | null,
  state: RetryState,
  budgets: RetryBudgets,
  waits: { rateLimitMs: number; serverBusyMs: number; incompleteMs: number },
): RetryDecision {
  switch (family) {
    case 'fatal':
      return { kind: 'give-up', family }
    case 'context-limit':
      if (state.contextLimitRetries >= budgets.maxContextLimitRetries) {
        return { kind: 'give-up', family }
      }
      return { kind: 'compact', family }
    case 'rate-limit':
      if (state.rateLimitRetries >= budgets.maxRateLimitRetries) {
        return { kind: 'give-up', family }
      }
      return { kind: 'wait', family, waitMs: waits.rateLimitMs }
    case 'server-busy':
      if (state.serverBusyRetries >= budgets.maxServerBusyRetries) {
        return { kind: 'give-up', family }
      }
      return { kind: 'wait', family, waitMs: waits.serverBusyMs }
    case 'incomplete':
      if (state.incompleteRetries >= budgets.maxIncompleteRetries) {
        return { kind: 'give-up', family }
      }
      return { kind: 'wait', family, waitMs: waits.incompleteMs }
    default:
      // A generic failure is retried while the TOTAL attempt budget lasts.
      if (state.attempt >= budgets.askRetries - 1) {
        return { kind: 'give-up', family: 'generic' }
      }
      return { kind: 'generic', waitMs: 2000 * (state.attempt + 1) }
  }
}
