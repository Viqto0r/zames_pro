import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recoverFromContextLimit } from '../src/context-limit.ts'

// test/context-limit-recovery-keys.test.ts pins the main sequence. Three
// branches were open: a compaction that throws a NON-Error (a string, a plain
// object), and the two ODD attempt values a caller could pass (`0` and NaN) —
// the budget check is `attempt > maxRetries`, so both are still allowed and the
// compaction runs ONCE.

const t = (k: string, p?: Record<string, unknown>): string =>
  k + (p ? ' ' + JSON.stringify(p) : '')

function deps(over: Record<string, unknown> = {}) {
  const notices: string[] = []
  return {
    notices,
    deps: {
      recover: async () => true,
      maxRetries: 3,
      attempt: 1,
      notice: (s: string) => notices.push(s),
      t,
      keys: { compact: 'c', compactFailed: 'f', giveUp: 'g' },
      provider: 'DS',
      ...over,
    },
  }
}

test('a compaction that throws a STRING still gives up with a notice', async () => {
  const { deps: d, notices } = deps({
    recover: async () => {
      throw 'strfail'
    },
  })
  const orig = new Error('original')
  const r = await recoverFromContextLimit(d as never, orig)
  assert.equal(r.resend, false)
  assert.equal(r.error, orig, 'the ORIGINAL failure must reach the caller')
  // The non-Error message flattens to an empty string (there is no `.message`),
  // but the failed notice is still printed and the give-up follows.
  assert.ok(notices.some((n) => n.startsWith('f')))
  assert.ok(notices.some((n) => n.startsWith('g')))
})

test('attempt 0 is inside the budget and compacts once', async () => {
  let calls = 0
  const { deps: d, notices } = deps({
    attempt: 0,
    recover: async () => {
      calls++
      return true
    },
  })
  const r = await recoverFromContextLimit(d as never, new Error('o'))
  assert.deepEqual(r, { resend: true })
  assert.equal(calls, 1)
  assert.ok(notices[0].startsWith('c'))
})

test('a NaN attempt never compares greater, so the compaction runs', async () => {
  let calls = 0
  const { deps: d } = deps({
    attempt: Number.NaN,
    recover: async () => {
      calls++
      return false
    },
  })
  const r = await recoverFromContextLimit(d as never, new Error('o'))
  // `recover()` returned false, so the answer is still a give-up.
  assert.equal(r.resend, false)
  assert.equal(calls, 1, 'the NaN attempt was treated as over budget')
})

test('the give-up notice carries the flattened provider label', async () => {
  const { deps: d, notices } = deps({ attempt: 99, provider: 'A\nB' })
  await recoverFromContextLimit(d as never, new Error('o'))
  assert.equal(notices.length, 1)
  assert.ok(notices[0].startsWith('g'))
  assert.ok(notices[0].includes('A B'), notices[0])
})
