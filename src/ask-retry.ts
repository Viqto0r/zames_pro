// N1 stage 4: the retry POLICY of a provider's ask() as a PURE function.
//
// The real implementation now lives in src/retry-policy.ts (it grew the
// incremental-backoff mode); this module stays as the historical import
// point so the providers and the tests do not churn.
//
// WHY the split: the DECISION (family -> wait / compact / give-up) is pure
// and unit-tested, while the loop (sends, throttling, aborts) stays in the
// browser class. A new backend only supplies the `classify` function.

export { decideRetry } from './retry-policy.js'
export type {
  RetryFamily,
  RetryBudgets,
  RetryState,
  RetryDecision,
  RetryWaits,
} from './retry-policy.js'
