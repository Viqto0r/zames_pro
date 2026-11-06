import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReusable } from '../src/web.ts'

// `createReusable` memoizes the shared headless CONTEXT for WebFetch. Its
// `get()` checked `cached === null` and then awaited the factory, so two
// WebFetch calls that arrived together BOTH ran the factory: two Chromium
// contexts were created, the second overwrote the first and the first LEAKED
// (it was never disposed — `reset()` only sees the last one). The cache exists
// to keep ONE browser around, so the concurrent calls must share the SAME
// in-flight promise.

test('concurrent get() calls build ONE value', async () => {
  let made = 0
  let disposed = 0
  const r = createReusable(
    async () => {
      made++
      await new Promise((res) => setTimeout(res, 20))
      return made
    },
    async () => {
      disposed++
    },
  )
  const values = await Promise.all([r.get(), r.get(), r.get()])
  assert.equal(made, 1, 'the factory ran ' + made + ' times')
  assert.deepEqual(values, [1, 1, 1])
  await r.reset()
  assert.equal(disposed, 1)
})

test('a later get() reuses the cached value', async () => {
  let made = 0
  const r = createReusable(
    async () => ++made,
    async () => {},
  )
  assert.equal(await r.get(), 1)
  assert.equal(await r.get(), 1)
  assert.equal(made, 1)
})
