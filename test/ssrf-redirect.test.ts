import { test } from 'node:test'
import assert from 'node:assert/strict'
import { httpFetch, assertPublicUrl } from '../src/web.ts'

// N10 regression: WebFetch used `redirect: 'follow'`, so a public URL could
// redirect to a private address (169.254.169.254 / 127.0.0.1) AFTER
// assertPublicUrl approved the original — a classic SSRF bypass. Now each
// Location is validated before it is requested.

function withFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  const orig = globalThis.fetch
  globalThis.fetch = impl as typeof fetch
  return fn().finally(() => {
    globalThis.fetch = orig
  })
}

test('httpFetch blocks a redirect to a private address', async () => {
  let called = 0
  await withFetch(
    async (url) => {
      called++
      if (called === 1) {
        return new Response('', {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        })
      }
      return new Response('SHOULD NOT BE REACHED', { status: 200 })
    },
    async () => {
      await assert.rejects(
        () => httpFetch('http://example.com/'),
        /blocked|private/i,
      )
    },
  )
  assert.equal(called, 1, 'must not follow the private redirect')
})

test('httpFetch follows a redirect to a public address', async () => {
  let called = 0
  await withFetch(
    async (url) => {
      called++
      if (called === 1) {
        return new Response('', {
          status: 301,
          headers: { location: 'https://8.8.8.8/final' },
        })
      }
      return new Response('ok-body', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    },
    async () => {
      const r = await httpFetch('http://example.com/')
      assert.equal(r.status, 200)
      assert.equal(r.body, 'ok-body')
    },
  )
  assert.equal(called, 2)
})

test('assertPublicUrl rejects a private host directly', async () => {
  await assert.rejects(() => assertPublicUrl('http://127.0.0.1/'))
  await assert.rejects(() => assertPublicUrl('http://localhost/'))
  await assert.rejects(() => assertPublicUrl('http://169.254.169.254/latest/'))
})
