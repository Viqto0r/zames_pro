// SSRF guard: the IPv4-TRANSLATED IPv6 form `::ffff:0:a.b.c.d` (RFC 2765,
// `0:0:0:0:ffff:0:7f00:1` in hex) embeds an IPv4 address exactly like the
// mapped form `::ffff:a.b.c.d`. The guard only recognized the mapped one, so
// the translated literal stayed classified as PUBLIC and WebFetch could be
// pointed at localhost / cloud metadata through it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateIp } from '../src/web.ts'

test('IPv4-translated ::ffff:0:7f00:1 (hex) is private', () => {
  assert.equal(isPrivateIp('::ffff:0:7f00:1'), true)
  assert.equal(isPrivateIp('0:0:0:0:ffff:0:7f00:1'), true)
})

test('IPv4-translated ::ffff:0:a.b.c.d (dotted) is private', () => {
  assert.equal(isPrivateIp('::ffff:0:127.0.0.1'), true)
  assert.equal(isPrivateIp('::ffff:0:169.254.169.254'), true)
  assert.equal(isPrivateIp('::ffff:0:10.0.0.1'), true)
  assert.equal(isPrivateIp('::ffff:0:a9fe:a9fe'), true)
})

test('IPv4-translated with a PUBLIC embedded address stays public', () => {
  assert.equal(isPrivateIp('::ffff:0:8.8.8.8'), false)
  assert.equal(isPrivateIp('::ffff:0:808:808'), false)
})
