import { test } from 'node:test'
import assert from 'node:assert/strict'
import { awaitUploadPreview } from '../src/attach-flow.ts'

// `awaitUploadPreview` waits for the upload chip (the file NAME) to appear,
// and treats a lookup failure as "not there yet" (`.count().catch(() => 0)`).
// The CALL itself is not guarded, though: when the page is mid-navigation (a
// fresh chat, a reload after an upload) Playwright throws from `getByText`
// SYNCHRONOUSLY, before a promise even exists — the `.catch` never runs and
// the throw escapes `awaitUploadPreview` straight into `_attachFiles`, so the
// whole attach fails with a raw Playwright error. The wait is best-effort by
// design: a lookup error must mean "not visible yet", not a crash.
test('a throwing lookup does not escape awaitUploadPreview', async () => {
  await assert.doesNotReject(
    awaitUploadPreview(
      {
        waitForTimeout: async () => {},
        getByText: () => {
          throw new Error('Execution context was destroyed')
        },
      },
      ['a.txt'],
      30,
    ),
  )
})

test('a throwing lookup still lets the preview resolve once visible', async () => {
  let calls = 0
  await awaitUploadPreview(
    {
      waitForTimeout: async () => {},
      getByText: () => {
        calls++
        if (calls === 1) throw new Error('transient')
        return { count: async () => 1 }
      },
    },
    ['a.txt'],
    300,
  )
  assert.equal(calls >= 2, true)
})
