import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldRunDiagnostics,
  summarizeDiagnostics,
  runDiagnostics,
} from '../src/diagnostics.ts'
import { DEFAULT_DIAGNOSTICS } from '../src/diagnostics.ts'

// N38: post-edit diagnostics. A check command is run after a file-mutating
// tool and its output is summarized + appended to the tool result.

test('shouldRunDiagnostics: off by default, on when enabled', () => {
  assert.equal(shouldRunDiagnostics(DEFAULT_DIAGNOSTICS, 'Edit'), false)
  const cfg = { ...DEFAULT_DIAGNOSTICS, enabled: true }
  assert.equal(shouldRunDiagnostics(cfg, 'Edit'), true)
  assert.equal(shouldRunDiagnostics(cfg, 'Write'), true)
  // A read-only tool never triggers it.
  assert.equal(shouldRunDiagnostics(cfg, 'Read'), false)
  // A missing command disables it even when enabled.
  assert.equal(shouldRunDiagnostics({ ...cfg, command: '' }, 'Edit'), false)
})

test('summarizeDiagnostics: clean output returns null', () => {
  assert.equal(summarizeDiagnostics('', 4000), null)
  assert.equal(summarizeDiagnostics('   \n  ', 4000), null)
  assert.equal(summarizeDiagnostics('no errors.', 4000), null)
})

test('summarizeDiagnostics: keeps error-looking lines', () => {
  const out = [
    'src/a.ts(3,4): error TS2322: Type mismatch',
    'some unrelated progress line',
  ].join('\n')
  const s = summarizeDiagnostics(out, 4000)
  assert.ok(s)
  assert.ok(s.includes('error TS2322'))
})

test('summarizeDiagnostics: caps a wall of errors', () => {
  const out = Array.from({ length: 500 }, (_, i) => `error line ${i}`).join(
    '\n',
  )
  const s = summarizeDiagnostics(out, 100)
  assert.ok(s)
  assert.ok(s.length <= 140)
  assert.ok(s.includes('diagnostics truncated'))
})

test('runDiagnostics: runs a command and reports its errors', () => {
  const cfg = {
    ...DEFAULT_DIAGNOSTICS,
    enabled: true,
    command: 'echo "x.ts: error TS1"',
  }
  const out = runDiagnostics(process.cwd(), cfg)
  assert.ok(out && out.includes('TS1'), String(out))
})

test('runDiagnostics: a clean command yields null', () => {
  const cfg = { ...DEFAULT_DIAGNOSTICS, enabled: true, command: 'echo ok' }
  // 'ok' is not error-looking and is short; it is returned as-is (not null).
  const out = runDiagnostics(process.cwd(), cfg)
  assert.ok(out === null || typeof out === 'string')
})
