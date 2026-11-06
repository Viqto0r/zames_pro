import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatLimits } from '../src/limits-command.ts'
import type { SendStats } from '../src/send-telemetry.ts'
import type { TranslateFn } from '../src/i18n.ts'

// `/limits` renders numbers the operator reads as measurements. `summarizeSends`
// can legitimately produce an EMPTY aggregate, but a hand-edited telemetry file
// (or an older build) may carry junk, and a negative or NaN pause rounded to
// `-3s` / `NaNs` looks like a real reading instead of a broken value.
const t: TranslateFn = (k, p) => k + (p ? JSON.stringify(p) : '')

function stats(p: Partial<SendStats> = {}): SendStats {
  return {
    last10m: p.last10m ?? 0,
    last30m: p.last30m ?? 0,
    last60m: p.last60m ?? 0,
    rateLimits: p.rateLimits ?? 0,
    avgBlockMs: p.avgBlockMs ?? 0,
  }
}

test('a negative interval or block never renders as a negative number', () => {
  const lines = formatLimits(
    stats({ avgBlockMs: -5000 }),
    { providerLabel: 'Qwen', intervalMs: -3000, adaptive: false },
    t,
  )
  assert.ok(
    !/sec":"-/.test(lines[4].text),
    'a negative block was printed: ' + lines[4].text,
  )
  assert.ok(
    !/sec":"-/.test(lines[5].text),
    'a negative pause was printed: ' + lines[5].text,
  )
})

test('a non-finite count never renders as NaN', () => {
  const lines = formatLimits(
    stats({ last10m: Number.NaN, last30m: Number.POSITIVE_INFINITY }),
    { providerLabel: 'Qwen', intervalMs: 4000, adaptive: false },
    t,
  )
  for (const line of lines) {
    assert.ok(!/NaN|Infinity/.test(line.text), line.text)
  }
})
