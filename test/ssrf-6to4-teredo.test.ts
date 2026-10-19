// SSRF guard: two transition prefixes carry an embedded IPv4 address and were
// never judged by it.
//   * 6to4 — 2002:AABB:CCDD::/48 embeds the IPv4 address in groups 1 and 2,
//     so 2002:7f00:0001:: is 127.0.0.1 and 2002:a9fe:a9fe:: is the cloud
//     metadata address 169.254.169.254.
//   * Teredo — 2001:0000::/32 carries the CLIENT's IPv4 in the last 32 bits
//     XORed with 0xff (the server IPv4 sits in groups 3-4).
// Both resolved as PUBLIC, so WebFetch could reach loopback/internal services
// through them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateIp } from '../src/web.ts'

test('6to4 with an embedded loopback/private IPv4 is private', () => {
  assert.equal(isPrivateIp('2002:7f00:1::'), true)
  assert.equal(isPrivateIp('2002:7f00:0001:0:0:0:0:0'), true)
  assert.equal(isPrivateIp('2002:c0a8:101::'), true)
  assert.equal(isPrivateIp('2002:a9fe:a9fe::'), true)
})

test('6to4 with a public embedded IPv4 stays public', () => {
  assert.equal(isPrivateIp('2002:808:808::'), false) // 8.8.8.8
})

test('Teredo with a private client IPv4 is private', () => {
  // Client IPv4 is the last 32 bits XOR 0xffffffff: 127.0.0.1 -> 80ff:fffe.
  assert.equal(isPrivateIp('2001:0:4136:e378:8000:63bf:80ff:fffe'), true)
})

test('Teredo with a public client IPv4 stays public', () => {
  // 8.8.8.8 -> f7f7:f7f7.
  assert.equal(isPrivateIp('2001:0:4136:e378:8000:63bf:f7f7:f7f7'), false)
})
