import type { SendStats } from './send-telemetry.js'
import { translate, type TranslateFn } from './i18n.js'

// Pure rendering of `/limits`: `summarizeSends` aggregates the send events and
// this turns the aggregate into the operator-facing lines, so every branch (an
// empty log, only rate limits, a future-stamped line) is testable without a
// live browser.

/** One output line of `/limits` (before colouring). */
export interface LimitsLine {
  kind: 'title' | 'window' | 'rate' | 'interval'
  text: string
}

/**
 * The lines of `/limits` for an aggregate. `intervalMs` is the ACTIVE browser's
 * send interval and `adaptive` whether the pause is derived adaptively.
 */
export function formatLimits(
  stats: SendStats,
  opts: { providerLabel: string; intervalMs: number; adaptive: boolean },
  t: TranslateFn = translate('en'),
): LimitsLine[] {
  const out: LimitsLine[] = []
  out.push({
    kind: 'title',
    text: t('limits.title', { provider: opts.providerLabel }),
  })
  const windows: Array<[string, number]> = [
    ['10m', stats.last10m],
    ['30m', stats.last30m],
    ['60m', stats.last60m],
  ]
  for (const [label, n] of windows) {
    out.push({
      kind: 'window',
      text: t('limits.window', { label, n: String(n) }),
    })
  }
  out.push({
    kind: 'rate',
    text: t('limits.rate', {
      n: String(stats.rateLimits),
      sec: String(Math.round(stats.avgBlockMs / 1000)),
    }),
  })
  out.push({
    kind: 'interval',
    text: t('limits.interval', {
      sec: String(Math.round(opts.intervalMs / 1000)),
      adaptive: opts.adaptive ? t('limits.adaptive_on') : '',
    }),
  })
  return out
}

/** The text for an EMPTY telemetry file (nothing recorded yet). */
export function limitsEmptyMessage(
  path: string,
  t: TranslateFn = translate('en'),
): string {
  return t('limits.none', { path })
}
