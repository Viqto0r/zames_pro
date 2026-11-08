import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recoverFromContextLimit } from '../src/context-limit.ts'

// context-limit*.test.ts cover the detection and the NaN budget. This file
// pins the RECOVERY SEQUENCE itself: which notice is printed in which branch,
// which error reaches the caller, and the one-line flattening of the provider
// label and the compaction error (a newline there used to push the input panel
// down on a live notice row).

const t = (k: string, p?: Record<string, unknown>) =>
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

test('a successful recovery prints the compact notice and resends', async () => {
  const { deps: d, notices } = deps()
  const r = await recoverFromContextLimit(d as never, new Error('orig'))
  assert.deepEqual(r, { resend: true })
  assert.equal(notices.length, 1)
  assert.ok(notices[0].startsWith('c'))
})

test('a compaction that frees nothing gives up with the ORIGINAL error', async () => {
  const { deps: d, notices } = deps({ recover: async () => false })
  const orig = new Error('server said no')
  const r = await recoverFromContextLimit(d as never, orig)
  assert.equal(r.resend, false)
  assert.equal(r.error, orig)
  assert.ok(notices.some((n) => n.startsWith('g')))
})

test('a throwing compaction prints the failed notice, then gives up', async () => {
  const { deps: d, notices } = deps({
    recover: async () => {
      throw new Error('boom')
    },
  })
  const r = await recoverFromContextLimit(d as never, new Error('orig'))
  assert.equal(r.resend, false)
  assert.ok(notices.some((n) => n.startsWith('f')))
  assert.ok(notices.some((n) => n.startsWith('g')))
})

test('an exhausted budget gives up without calling recover', async () => {
  let calls = 0
  const { deps: d, notices } = deps({
    attempt: 4,
    recover: async () => {
      calls++
      return true
    },
  })
  const r = await recoverFromContextLimit(d as never, new Error('orig'))
  assert.equal(r.resend, false)
  assert.equal(calls, 0)
  assert.ok(notices.some((n) => n.startsWith('g')))
})

test('a missing recover gives up', async () => {
  const { deps: d } = deps({ recover: undefined })
  const r = await recoverFromContextLimit(d as never, new Error('orig'))
  assert.equal(r.resend, false)
})

test('a multi-line provider label is flattened into one notice row', async () => {
  const { deps: d, notices } = deps({ provider: 'Deep\nSeek\tX' })
  await recoverFromContextLimit(d as never, new Error('orig'))
  assert.equal(notices[0].includes('\n'), false)
  assert.ok(notices[0].includes('Deep Seek X'))
})

test('a multi-line compaction error is flattened too', async () => {
  const { deps: d, notices } = deps({
    recover: async () => {
      throw new Error('line one\nline two')
    },
  })
  await recoverFromContextLimit(d as never, new Error('orig'))
  const failed = notices.find((n) => n.startsWith('f'))!
  assert.equal(failed.includes('\n'), false)
  assert.ok(failed.includes('line one line two'))
})

test('attempt equal to the budget is still allowed (strict >)', async () => {
  let calls = 0
  const { deps: d } = deps({
    maxRetries: 2,
    attempt: 2,
    recover: async () => {
      calls++
      return true
    },
  })
  const r = await recoverFromContextLimit(d as never, new Error('orig'))
  assert.equal(r.resend, true)
  assert.equal(calls, 1)
})

test('a negative budget falls back to zero and gives up', async () => {
  let calls = 0
  const { deps: d } = deps({
    maxRetries: -1,
    attempt: 1,
    recover: async () => {
      calls++
      return true
    },
  })
  const r = await recoverFromContextLimit(d as never, new Error('orig'))
  assert.equal(r.resend, false)
  assert.equal(calls, 0)
})
