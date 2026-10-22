import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { SendRuntime } from '../src/send-runtime.ts'
import { makeTmpDir } from './tmp-dir.ts'

// With the adaptive throttle OFF the fold is skipped — and so is the
// `blockedAt` bookkeeping the telemetry reads. A rate-limit event then carries
// NO `blockMs` at all, so `/limits` cannot average the block length for a
// provider that runs the fixed interval. The block START must still be
// recorded; only the interval learning is adaptive.
test('a rate limit with adaptive off still records the block start', async (t) => {
  const dir = await makeTmpDir(t, 'zames-sr-nonadapt-')
  let now = 1_000_000
  const rt = new SendRuntime({
    provider: 'deepseek',
    logsDir: dir,
    adaptive: false,
    baseMs: 1000,
    rateLimitWaitMs: 5000,
    telemetry: true,
    now: () => now,
  })
  rt.onSend({})
  now += 1000
  rt.onOutcome('rate_limit')
  now += 60_000
  rt.onBlockLifted()
  await new Promise((r) => setTimeout(r, 120))
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'))
  const body = await fs.readFile(`${dir}/${files[0]}`, 'utf-8')
  const lines = body
    .trim()
    .split(String.fromCharCode(10))
    .map((l) => JSON.parse(l))
  const ok = lines.find((e) => e.outcome === 'ok')
  assert.ok(ok, 'no lifted event')
  assert.equal(typeof ok.blockMs, 'number')
})
