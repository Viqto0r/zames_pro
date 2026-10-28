// N1 stage 3: the SEND SLOT — the pause before a send that keeps the chat's
// rate limit happy.
//
// Every provider had its own `_waitForSendSlot()` with the same shape (skip a
// non-agent send, compute the remaining gap, report the animated countdown,
// mark the state 'paused', sleep interruptibly) and each computed the gap its
// own way (DeepSeek: interval + thinking bonus; Qwen: interval; GLM: the
// adaptive sendRuntime). The MECHANICS are shared here; the provider injects
// the gap and the plumbing.

export interface SendSlotDeps {
  /** Milliseconds still to wait (0 or less = send now). */
  gapMs: () => number
  /** Stop the wait early (Esc / a cancelled ask). */
  isInterrupted: () => boolean
  /** The interruptible sleep used by the provider. */
  sleep: (ms: number, onTick: (leftMs: number) => void) => Promise<boolean>
  /** Operator-facing countdown (one call per second, then once at the start). */
  onPause?: (secs: number) => void
  /** Fallback when no UI hook is wired (a direct ask() from a script). */
  onPauseText?: (secs: number) => void
  /** Send-state emitter (`paused` / `settled`). */
  emitState?: (state: 'paused' | 'settled') => void
}

/**
 * Wait for the send slot. Returns true when the wait was INTERRUPTED (the
 * caller must then abort the send).
 */
export async function waitForSendSlot(
  agent: boolean,
  deps: SendSlotDeps,
): Promise<boolean> {
  if (!agent) return false
  const gap = deps.gapMs()
  if (gap <= 0) return false
  const report = (leftMs: number): void => {
    const secs = Math.max(0, Math.ceil(leftMs / 1000))
    if (deps.onPause) {
      try {
        deps.onPause(secs)
      } catch {}
    } else if (deps.onPauseText) {
      deps.onPauseText(secs)
    }
  }
  report(gap)
  if (deps.emitState) deps.emitState('paused')
  return await deps.sleep(gap, report)
}
