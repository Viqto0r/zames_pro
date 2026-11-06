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
  // A counter is a count and a pause is a duration: a negative/NaN/Infinity
  // value (a hand-edited telemetry line, a broken provider counter) must not
  // render as `-3s` / `NaNs`, which reads like a real measurement.
  const num = (v: number): string =>
    typeof v === 'number' && Number.isFinite(v) ? String(Math.max(0, v)) : '0'
  out.push({
    kind: 'title',
    // The provider label comes from the config: a newline in it would start a
    // row of its own.
    text: t('limits.title', {
      provider: String(opts.providerLabel ?? '').replace(/\s+/g, ' '),
    }),
  })
  const windows: Array<[string, number]> = [
    ['10m', stats.last10m],
    ['30m', stats.last30m],
    ['60m', stats.last60m],
  ]
  for (const [label, n] of windows) {
    out.push({
      kind: 'window',
      text: t('limits.window', { label, n: num(n) }),
    })
  }
  out.push({
    kind: 'rate',
    text: t('limits.rate', {
      n: num(stats.rateLimits),
      sec: String(Math.round(Number(num(stats.avgBlockMs)) / 1000)),
    }),
  })
  out.push({
    kind: 'interval',
    text: t('limits.interval', {
      sec: String(Math.round(Number(num(opts.intervalMs)) / 1000)),
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
  // The path comes from the HOME directory: a newline in it would start a row
  // of its own in the terminal (every other report row flattens its values).
  return t('limits.none', {
    path: String(path ?? '').replace(/\s+/g, ' '),
  })
}
