import type { TranslateFn } from './i18n.js'

/**
 * The recovery shared by every provider when the chat's CONTEXT WINDOW is
 * exhausted (DeepSeek: "Length limit reached. Please start a new chat.").
 *
 * The chat refuses EVERY further send, so a retry in place can never succeed:
 * the caller injects a callback that compacts the chat into a fresh one and
 * returns true only when the resend may proceed. This module exists because the
 * sequence — count the attempts, notify, give up with a clear message — is
 * identical for all backends while only the i18n keys differ.
 */
export interface ContextLimitRecoveryDeps {
  /** The injected recovery (index.ts implements it with performCompact). */
  recover: () => Promise<boolean>
  /**
   * Independent budget: a compaction that frees nothing leaves the chat just
   * as rejected, so this must not consume the regular ask() attempts.
   */
  maxRetries: number
  /** Current attempt (1-based), already incremented by the caller. */
  attempt: number
  /** Service notice printer (reaches the operator above the input line). */
  notice: (text: string) => void
  t: TranslateFn
  /** i18n keys of the provider-specific messages. */
  keys: { compact: string; compactFailed: string; giveUp: string }
  /** Provider label for the give-up message ("DeepSeek"). */
  provider: string
}

/** Result of one recovery attempt: may the SAME prompt be resent? */
export interface ContextLimitRecoveryResult {
  resend: boolean
  /** Set when ask() must give up with this error instead of resending. */
  error?: Error
}

/**
 * Run ONE context-limit recovery. The caller resends only on `resend: true`;
 * on `resend: false` it throws `error`, which is the ORIGINAL failure so the
 * operator keeps the real reason (a wrapper would hide the server text).
 */
export async function recoverFromContextLimit(
  deps: ContextLimitRecoveryDeps,
  original: Error,
): Promise<ContextLimitRecoveryResult> {
  const { recover, maxRetries, attempt, notice, t, keys, provider } = deps
  const giveUp = (): ContextLimitRecoveryResult => {
    notice(t(keys.giveUp, { provider }))
    return { resend: false, error: original }
  }
  if (!recover || attempt > maxRetries) return giveUp()
  notice(t(keys.compact, { provider }))
  let recovered = false
  try {
    recovered = await recover()
  } catch (e) {
    notice(t(keys.compactFailed, { error: (e as Error).message }))
  }
  if (!recovered) return giveUp()
  return { resend: true }
}
