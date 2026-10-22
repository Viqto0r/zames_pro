import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  runCoverageGate,
  parseCoverageRows,
} from '../scripts/coverage-gate-lib.mts'

// Several test files load `src/sessions.ts` through a CACHE-BUSTED import
// (`?fresh=…`) so each gets its own HOME. Node prints one coverage row PER
// MODULE INSTANCE, and the gate used to keep the FIRST match — the partial
// instance (sessions.ts 30.86%) — so a module whose real suite reported 98%
// failed CI with `sessions.ts: 34.2% < floor 90%` on every push.

test('parseCoverageRows: instances of one module are merged (best wins)', () => {
  const rows = parseCoverageRows(
    [
      'ℹ  sessions.ts          |  30.86 |   100.00 |    7.69 | 31-40',
      'ℹ  sessions.ts?fresh=x  |  98.00 |    90.00 |   95.00 | 1',
      'ℹ  commands.ts          |  94.14 |    78.70 |   93.88 | 40-56',
    ].join(String.fromCharCode(10)),
  )
  assert.equal(rows.get('sessions.ts'), 98)
  assert.equal(rows.get('commands.ts'), 94.14)
})

test('parseCoverageRows: a cache-busted suffix never becomes a key', () => {
  const rows = parseCoverageRows(
    'ℹ  sessions.ts?fresh=x  |  98.00 |  90.00 |  95.00 | 1',
  )
  assert.equal(rows.get('sessions.ts'), 98)
  assert.equal(rows.has('sessions.ts?fresh=x'), false)
})

test('runCoverageGate: a module below its floor still fails', () => {
  const res = runCoverageGate(
    new Map([
      ['tools.ts', 10],
      ['undo.ts', 90],
    ]),
    { 'tools.ts': 90, 'undo.ts': 85 },
  )
  assert.equal(res.ok, false)
  assert.deepEqual(
    res.failures.map((f) => f.file),
    ['tools.ts'],
  )
})

test('runCoverageGate: a missing row is a failure, not silence', () => {
  const res = runCoverageGate(new Map(), { 'tools.ts': 90 })
  assert.equal(res.ok, false)
  assert.deepEqual(
    res.failures.map((f) => f.reason),
    ['no coverage row found'],
  )
})
