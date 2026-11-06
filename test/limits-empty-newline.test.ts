import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limitsEmptyMessage, formatLimits } from '../src/limits-command.ts'

// `/limits` prints the telemetry path in its empty-state message. That path is
// built from the HOME directory, and a POSIX directory name may legally
// contain a newline — the value went into the template WITHOUT the shared
// one-line flattening every other report row applies, so it started a row of
// its own in the terminal.

const NL = String.fromCharCode(10)

test('a newline in the telemetry path stays on one line', () => {
  const msg = limitsEmptyMessage('/home/a' + NL + 'FAKE')
  assert.equal(msg.includes(NL), false, JSON.stringify(msg))
  assert.match(msg, /\/home\/a FAKE/)
})

test('a normal path is unchanged', () => {
  assert.match(limitsEmptyMessage('/home/a/t.jsonl'), /\/home\/a\/t\.jsonl/)
})

test('the provider label of the header is flattened too', () => {
  const lines = formatLimits(
    {
      last10m: 1,
      last30m: 1,
      last60m: 1,
      rateLimits: 0,
      avgBlockMs: 0,
    } as never,
    { providerLabel: 'a' + NL + 'b', intervalMs: 1000, adaptive: false },
  )
  assert.equal(lines[0].text.includes(NL), false, JSON.stringify(lines[0]))
})
