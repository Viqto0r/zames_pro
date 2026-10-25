import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatLimits, limitsEmptyMessage } from '../src/limits-command.js'
import { translate } from '../src/i18n.js'
import type { SendStats } from '../src/send-telemetry.js'

const t = translate('en')

function stats(p: Partial<SendStats> = {}): SendStats {
  return {
    last10m: p.last10m ?? 0,
    last30m: p.last30m ?? 0,
    last60m: p.last60m ?? 0,
    rateLimits: p.rateLimits ?? 0,
    avgBlockMs: p.avgBlockMs ?? 0,
  }
}

const opts = { providerLabel: 'Qwen', intervalMs: 4000, adaptive: false }

test('formatLimits: an all-zero aggregate still renders every line', () => {
  const lines = formatLimits(stats(), opts, t)
  assert.deepEqual(
    lines.map((l) => l.kind),
    ['title', 'window', 'window', 'window', 'rate', 'interval'],
  )
  assert.match(lines[0].text, /Qwen/)
  assert.match(lines[1].text, /10m: 0/)
  assert.match(lines[4].text, /rate limits: 0/)
})

test('formatLimits: only rate limits present renders 0 windows but a real count', () => {
  const lines = formatLimits(
    stats({ rateLimits: 3, avgBlockMs: 12_400 }),
    opts,
    t,
  )
  assert.match(lines[1].text, /10m: 0/)
  assert.match(lines[4].text, /rate limits: 3/)
  // 12400ms rounds to 12s, not 12.4 or 0.
  assert.match(lines[4].text, /12s/)
})

test('formatLimits: the interval is reported in SECONDS and rounds', () => {
  const lines = formatLimits(stats(), { ...opts, intervalMs: 15_000 }, t)
  assert.match(lines[5].text, /current pause: 15s/)
})

test('formatLimits: adaptive appends its suffix, non-adaptive does not', () => {
  const on = formatLimits(stats(), { ...opts, adaptive: true }, t)
  assert.match(on[5].text, /\(adaptive\)/)
  const off = formatLimits(stats(), { ...opts, adaptive: false }, t)
  assert.ok(!/\(adaptive\)/.test(off[5].text))
})

test('formatLimits: a FUTURE-stamped event never inflates a window (via the caller)', () => {
  // summarizeSends already drops future stamps; this pins the RENDERING of the
  // aggregate it produces, so a wrong window count shows up as 0.
  const lines = formatLimits(
    stats({ last10m: 0, last30m: 1, last60m: 1 }),
    opts,
    t,
  )
  assert.match(lines[1].text, /10m: 0/)
  assert.match(lines[2].text, /30m: 1/)
  assert.match(lines[3].text, /60m: 1/)
})

test('limitsEmptyMessage: names the telemetry path', () => {
  const m = limitsEmptyMessage('/home/u/.zames/logs/sends-qwen.jsonl', t)
  assert.match(m, /sends-qwen\.jsonl/)
})
