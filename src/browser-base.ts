import type { Locator, Page } from 'playwright-core'

// N1 stage 1: the helpers that were byte-identical in DeepSeekBrowser,
// QwenBrowser and GlmBrowser. Composition, not inheritance: every provider
// class owns a page and calls these with it, so the provider-specific logic
// stays where it is and only the shared mechanics live here.

/** Best-effort: a page error while marking the tab title must never break a
 *  send loop, so every failure is swallowed. */
export async function setBusyTitle(
  page: Page,
  busy: boolean,
  setInDom: (busy: boolean) => unknown,
): Promise<void> {
  try {
    await page.evaluate(setInDom, busy)
  } catch {}
}

/**
 * The first selector that has a VISIBLE element. `timeout` is a per-selector
 * budget, not a total one (the providers rely on that: a login form is tried
 * with a long budget while optional probes use a short one).
 *
 * Two probe styles exist in the providers (`waitFor({state:'visible'})` in
 * DeepSeek/Qwen and `count()` + `isVisible()` in GLM). `style: 'wait'` keeps
 * the first (it also covers a late-mounting element); `style: 'check'` keeps
 * the second (no waiting state, a cheap poll).
 */
export async function findVisible(
  page: Page,
  selectors: string[],
  timeout = 1000,
  style: 'wait' | 'check' = 'wait',
): Promise<Locator | null> {
  for (const sel of selectors) {
    const loc = page.locator(sel).last()
    if (style === 'wait') {
      try {
        await loc.waitFor({ state: 'visible', timeout })
        return loc
      } catch {}
      continue
    }
    try {
      if ((await loc.count()) === 0) continue
      if (await loc.isVisible({ timeout }).catch(() => false)) return loc
    } catch {}
  }
  return null
}

/**
 * Sleep in 100 ms chunks so Esc and the ask() watchdog stay responsive.
 * Returns true when the wait was INTERRUPTED (abort / cancelled ask), so the
 * caller can stop early. `onTick` fires about once a second with the time
 * left — that is what animates the throttle countdown.
 */
export async function sleepInterruptible(
  page: Page,
  ms: number,
  isInterrupted: () => boolean,
  onTick?: (leftMs: number) => void,
): Promise<boolean> {
  const step = 100
  let left = ms
  let sinceTick = 0
  while (left > 0) {
    if (isInterrupted()) return true
    const chunk = Math.min(step, left)
    await page.waitForTimeout(chunk)
    left -= chunk
    if (onTick) {
      sinceTick += chunk
      if (sinceTick >= 1000) {
        sinceTick = 0
        onTick(left)
      }
    }
  }
  return isInterrupted()
}
