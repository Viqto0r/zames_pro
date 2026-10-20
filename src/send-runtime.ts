// Per-browser SEND RUNTIME: telemetry + the adaptive throttle, wired in ONE
// place so each provider class only forwards its send events here.
//
// WHY a helper instead of per-class code: the three backends (DeepSeek, Qwen,
// GLM) share the policy but differ in where a send starts and how an error is
// classified. Keeping the state machine here means one implementation to test
// and one place to look at when "the agent waits too long" is reported.
//
// The state lives ON the browser object (a SendRuntime instance), so it
// survives across tasks and a provider switch within a session (a new browser
// object is created, but the operator's decision about the interval does not
// silently reset mid-session — it is re-derived from this session's events).

import {
  DEFAULT_THROTTLE,
  initialThrottleState,
  applySendEvent,
  nextWaitMs,
  withBlockDuration,
  type ThrottleConfig,
  type ThrottleState,
} from './send-throttle.js'
import {
  appendSendEvent,
  type SendEvent,
  type SendOutcome,
} from './send-telemetry.js'

export interface SendRuntimeOptions {
  provider: string
  /** The provider's configured base interval (ms). */
  baseMs: number
  /** The provider's configured rate-limit pause (ms). */
  rateLimitWaitMs: number
  /** Use the adaptive interval (GLM: on; DeepSeek/Qwen: off). */
  adaptive: boolean
  /** Write the telemetry line (browser.sendTelemetry). */
  telemetry: boolean
  /** `~/.zames/logs` — the telemetry file's directory. */
  logsDir: string
  /** The soft-window knobs (W minutes / B sends). */
  windowMs?: number
  budget?: number
  now?: () => number
}

/**
 * The runtime a provider keeps: the learned interval, the last send and the
 * bookkeeping needed to record the outcome of the NEXT send.
 */
export class SendRuntime {
  private cfg: ThrottleConfig
  state: ThrottleState
  private opts: SendRuntimeOptions
  private now: () => number
  private lastSentAt = 0
  private pending: SendEvent | null = null

  constructor(opts: SendRuntimeOptions) {
    this.opts = opts
    this.now = opts.now || Date.now
    this.cfg = {
      baseMs: opts.baseMs,
      rateLimitWaitMs: opts.rateLimitWaitMs,
      ...DEFAULT_THROTTLE,
      windowMs: opts.windowMs ?? DEFAULT_THROTTLE.windowMs,
      budget: opts.budget ?? DEFAULT_THROTTLE.budget,
    }
    this.state = initialThrottleState(this.cfg)
  }

  /** The interval currently in force (the adaptive one when enabled). */
  intervalMs(): number {
    return this.opts.adaptive ? this.state.intervalMs : this.opts.baseMs
  }

  /** Milliseconds to wait before the next send. */
  waitMs(): number {
    if (!this.opts.adaptive) {
      const gap = this.opts.baseMs - (this.now() - this.lastSentAt)
      return this.lastSentAt && gap > 0 ? gap : 0
    }
    return nextWaitMs(this.state, this.lastSentAt, this.now())
  }

  /**
   * Mark a send as STARTED. `model`/`thinking`/`webSearch` are recorded with
   * the outcome, so a later analysis can correlate a limit with a mode.
   */
  onSend(
    info: { model?: string; thinking?: boolean; webSearch?: boolean } = {},
  ): void {
    const waited = this.lastSentAt ? this.now() - this.lastSentAt : 0
    this.lastSentAt = this.now()
    this.pending = {
      at: new Date(this.lastSentAt).toISOString(),
      provider: this.opts.provider,
      model: info.model,
      thinking: info.thinking,
      webSearch: info.webSearch,
      intervalMs: this.intervalMs(),
      waitedMs: waited,
      outcome: 'ok',
    }
  }

  /**
   * Record the outcome of the send started by onSend(). `errorText` and
   * `retryAfterMs` come from the server and never include the prompt.
   */
  onOutcome(
    outcome: SendOutcome,
    extra: { errorText?: string; retryAfterMs?: number } = {},
  ): void {
    if (!this.pending) return
    let e: SendEvent = { ...this.pending, outcome }
    if (extra.errorText) e.errorText = String(extra.errorText).slice(0, 300)
    if (typeof extra.retryAfterMs === 'number') {
      e.retryAfterMs = extra.retryAfterMs
    }
    if (this.opts.adaptive) {
      this.state = applySendEvent(this.state, e, this.cfg, this.now())
    }
    if (outcome === 'rate_limit') {
      e = withBlockDuration(e, this.state.blockedAt, this.now())
    }
    if (this.opts.telemetry) {
      appendSendEvent(this.opts.logsDir, e)
    }
    this.pending = null
  }

  /**
   * The block lifted (the next send succeeded after a rate limit): the
   * telemetry gets the measured duration.
   */
  onBlockLifted(): void {
    if (!this.state.blockedAt) return
    const liftedAt = this.now()
    if (this.opts.telemetry) {
      appendSendEvent(this.opts.logsDir, {
        at: new Date(liftedAt).toISOString(),
        provider: this.opts.provider,
        intervalMs: this.intervalMs(),
        waitedMs: 0,
        outcome: 'ok',
        blockMs: liftedAt - this.state.blockedAt,
      })
    }
    this.state = { ...this.state, blocked: false, blockedAt: 0 }
  }
}
