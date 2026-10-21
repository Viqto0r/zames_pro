import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rewriteFailedAttachments } from '../src/commands.ts'

// rewriteFailedAttachments marks a file that FAILED to attach so the model does
// not believe it was sent. It used a plain split(path).join(marker): a failed
// path that is a PREFIX of another, HEALTHY path then rewrote that one too
// ('/p/a.ts' also matched inside '/p/a.tsx'), and the model was told a file it
// actually has is missing. Only a WHOLE path may be rewritten.
test('a failed path does not rewrite a longer sibling path', () => {
  const out = rewriteFailedAttachments('see /p/a.ts and /p/a.tsx', [
    { path: '/p/a.ts', name: 'a.ts' },
  ])
  assert.ok(out.includes('[attach-failed: a.ts]'), out)
  assert.ok(out.includes('/p/a.tsx'), 'the healthy /p/a.tsx must stay: ' + out)
  assert.ok(!out.includes('.tsx]'), out)
})

test('the exact path is still replaced, even at the end of the text', () => {
  assert.equal(
    rewriteFailedAttachments('x /p/doc.txt', [
      { path: '/p/doc.txt', name: 'doc.txt' },
    ]),
    'x [attach-failed: doc.txt]',
  )
})

test('a path inside a longer name is not touched either', () => {
  const out = rewriteFailedAttachments('backup/p/doc.txt.bak', [
    { path: '/p/doc.txt', name: 'doc.txt' },
  ])
  assert.ok(out.includes('/p/doc.txt.bak'), out)
})
