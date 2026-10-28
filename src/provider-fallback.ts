// N8: the FALLBACK-PROVIDER decision as a PURE function.
//
// When the active backend exhausted its retries (rate limit / server busy /
// an unrecoverable send), the task used to stop even though `/provider` and
// the existing handoff machinery could continue it on another chat. A
// candidate is usable ONLY when it is a different, AUTHORIZED provider: a
// marker in `~/.zames/auth.json` AND a confirmed login (`probeLogin()`). Guest
// mode is never a fallback — a guest gets a handful of turns a day (Qwen) and
// GLM gates the first send with a captcha, so the task would die a few steps
// later, in a worse place.
//
// Everything here is data-in, decision-out: the caller supplies the auth
// marker text, the config flag and the async login probe.

import type { ProviderId } from './providers.js'

export interface FallbackCandidate {
  id: ProviderId
  /** The provider allows a GUEST session at all (Qwen, GLM). */
  guestAllowed: boolean
  /** The raw auth.json text (`''` = no marker file). */
  authMarker: string
  /**
   * Is the CURRENT session a guest one? Only a SIGNED-IN session can be a
   * fallback: a guest gets a handful of turns a day (Qwen) and GLM gates the
   * first send with a captcha, so the task would die a few steps later in a
   * worse place. A provider that merely SUPPORTS guests is fine once signed in.
   */
  guestSession?: boolean
}

export interface FallbackDecision {
  /** The provider to switch to, or null when nothing is usable. */
  provider: ProviderId | null
  /** Providers that COULD become a fallback after a real sign-in. */
  authorizable: ProviderId[]
}

/**
 * Pick the first usable fallback provider.
 *
 * `hasMarker(id, raw)` is injected (authMarkerHas) so this module stays free
 * of the marker format; `probeLogin(id)` confirms the stored session really
 * works — a marker without a live session is useless (the switch would land on
 * a login page mid-task).
 */
export async function pickFallbackProvider(
  active: ProviderId,
  candidates: FallbackCandidate[],
  probeLogin: (id: ProviderId) => Promise<boolean>,
  hasMarker: (raw: string, id: ProviderId) => boolean,
): Promise<FallbackDecision> {
  const authorizable: ProviderId[] = []
  for (const c of candidates) {
    if (c.id === active) continue
    // A live GUEST session is not a fallback (it dies in a few turns), but the
    // provider is still authorizable — signing in makes it a candidate.
    if (c.guestAllowed && c.guestSession !== false) {
      authorizable.push(c.id)
      continue
    }
    const marker = hasMarker(c.authMarker, c.id)
    if (!marker) {
      authorizable.push(c.id)
      continue
    }
    const ok = await probeLogin(c.id).catch(() => false)
    if (ok) return { provider: c.id, authorizable }
    // A stale marker is NOT authorizable in place: the session must be renewed
    // interactively, which this path must not start mid-task.
    authorizable.push(c.id)
  }
  return { provider: null, authorizable }
}
