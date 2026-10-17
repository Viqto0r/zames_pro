// SSRF guard: the IPv4-compatible IPv6 form `::a.b.c.d` (deprecated but
// still resolvable by the OS/HTTP stack, e.g. `http://[::127.0.0.1]/`) was
// NOT recognised as private. The guard knew `::ffff:127.0.0.1` (mapped) and
// `64:ff9b::…` (NAT64) but not the plain compatible form, so WebFetch could
// reach localhost/cloud metadata through it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateIp } from '../src/web.ts'

test('IPv4-compatible ::a.b.c.d loopback is private', () => {
  assert.equal(isPrivateIp('::127.0.0.1'), true)
  assert.equal(isPrivateIp('::10.0.0.1'), true)
  assert.equal(isPrivateIp('::169.254.169.254'), true)
})

test('IPv4-compatible hex form ::7f00:1 is private', () => {
  assert.equal(isPrivateIp('::7f00:1'), true)
})

test('a public IPv6 is still public', () => {
  assert.equal(isPrivateIp('2001:4860:4860::8888'), false)
  assert.equal(isPrivateIp('::ffff:8.8.8.8'), false)
})
