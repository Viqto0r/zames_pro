// awaitUploadPreview() waits for the attached-file CHIP by looking the file
// NAME up in the page text with a SUBSTRING match (`exact: false`). A short or
// common name (`a`, `image`, `test`) matches unrelated text already on the
// page (history, sidebar, the operator's own words), so the wait returns
// IMMEDIATELY: the send proceeds while the upload has not started, and the
// message is submitted with the attachment still missing. The chip carries the
// FULL name, so an exact match is the right signal.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { awaitUploadPreview } from '../src/attach-flow.ts'

test('a common file name does not short-circuit the upload wait', async () => {
  let waited = 0
  const page = {
    waitForTimeout: async (ms: number) => {
      waited += ms
    },
    getByText: (text: string, opts?: { exact?: boolean }) => ({
      // The exact chip is NOT on the page; only the bare substring `a` is.
      count: async () => (text === 'a' && opts?.exact === false ? 5 : 0),
    }),
  }
  const t0 = Date.now()
  await awaitUploadPreview(page as never, ['a'], 200)
  const elapsed = Date.now() - t0
  assert.ok(elapsed >= 150, 'returned instantly: ' + elapsed + 'ms')
  assert.ok(waited >= 150, 'waited ' + waited)
})
