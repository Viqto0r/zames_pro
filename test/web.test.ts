import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isPrivateIp,
  isPrivateHostname,
  isBinaryContentType,
} from '../src/web.ts'

test('isPrivateIp: IPv4 private/loopback/link-local ranges', () => {
  assert.equal(isPrivateIp('127.0.0.1'), true)
  assert.equal(isPrivateIp('10.1.2.3'), true)
  assert.equal(isPrivateIp('172.16.0.1'), true)
  assert.equal(isPrivateIp('172.31.255.255'), true)
  assert.equal(isPrivateIp('192.168.1.1'), true)
  assert.equal(isPrivateIp('169.254.169.254'), true) // cloud metadata
  assert.equal(isPrivateIp('100.64.0.1'), true) // CGNAT
  assert.equal(isPrivateIp('0.0.0.0'), true)
})

test('isPrivateIp: public IPv4 is allowed', () => {
  assert.equal(isPrivateIp('8.8.8.8'), false)
  assert.equal(isPrivateIp('1.1.1.1'), false)
  assert.equal(isPrivateIp('172.32.0.1'), false) // just outside 172.16/12
  assert.equal(isPrivateIp('192.169.1.1'), false)
})

test('isPrivateIp: IPv6 loopback / link-local / ULA', () => {
  assert.equal(isPrivateIp('::1'), true)
  assert.equal(isPrivateIp('::'), true)
  assert.equal(isPrivateIp('fe80::1'), true)
  assert.equal(isPrivateIp('fc00::1'), true)
  assert.equal(isPrivateIp('fd12:3456::1'), true)
  // fe80::/10 spans fe80..febf — the whole range must be private, not just
  // the literal 'fe80' prefix.
  assert.equal(isPrivateIp('fe90::1'), true)
  assert.equal(isPrivateIp('fea0::1'), true)
  assert.equal(isPrivateIp('febf::1'), true)
  assert.equal(isPrivateIp('fec0::1'), true) // deprecated site-local -> non-public
  assert.equal(isPrivateIp('2001:4860:4860::8888'), false)
})

test('isPrivateIp: IPv4-mapped IPv6', () => {
  assert.equal(isPrivateIp('::ffff:127.0.0.1'), true)
  assert.equal(isPrivateIp('::ffff:8.8.8.8'), false)
  // hex form: ::ffff:7f00:1 == 127.0.0.1
  assert.equal(isPrivateIp('::ffff:7f00:1'), true)
  assert.equal(isPrivateIp('::ffff:a00:1'), true) // 10.0.0.1
  assert.equal(isPrivateIp('::ffff:808:808'), false) // 8.8.8.8
  // NAT64 well-known prefix can encode a private IPv4 too.
  assert.equal(isPrivateIp('64:ff9b::7f00:1'), true)
})

test('isPrivateHostname blocks localhost and metadata host', () => {
  assert.equal(isPrivateHostname('localhost'), true)
  assert.equal(isPrivateHostname('foo.localhost'), true)
  assert.equal(isPrivateHostname('metadata.google.internal'), true)
  assert.equal(isPrivateHostname('example.com'), false)
  assert.equal(isPrivateHostname(''), true)
  // internal / mDNS / home.arpa names never belong to the public internet.
  assert.equal(isPrivateHostname('db.internal'), true)
  assert.equal(isPrivateHostname('nas.local'), true)
  assert.equal(isPrivateHostname('router.home.arpa'), true)
  assert.equal(isPrivateHostname('example.localhost.com'), false)
})

test('isBinaryContentType: binary bodies are not dumped as text', () => {
  assert.equal(isBinaryContentType('application/pdf'), true)
  assert.equal(isBinaryContentType('image/png'), true)
  assert.equal(isBinaryContentType('application/zip'), true)
  assert.equal(isBinaryContentType('application/octet-stream'), true)
  assert.equal(isBinaryContentType('audio/mpeg'), true)
  assert.equal(isBinaryContentType('application/vnd.ms-excel'), true)
})

test('isBinaryContentType: textual types stay readable', () => {
  assert.equal(isBinaryContentType('text/html; charset=utf-8'), false)
  assert.equal(isBinaryContentType('text/plain'), false)
  assert.equal(isBinaryContentType('application/json'), false)
  assert.equal(isBinaryContentType('application/ld+json'), false)
  assert.equal(isBinaryContentType('application/xml'), false)
  assert.equal(isBinaryContentType('application/javascript'), false)
  assert.equal(isBinaryContentType(''), false)
})

// A NON-canonical IPv4 literal is still parsed as a number by the URL parser
// and by the OS resolver (WHATWG URL and inet_aton accept 1-4 parts, octal and
// hex): http://2130706433/, http://0x7f.1/ and http://0177.0.0.1/ ALL resolve
// to 127.0.0.1. The guard only recognised the dotted-quad form, so
// assertPublicUrl let these through — a classic SSRF filter bypass.
test('isPrivateIp: non-canonical IPv4 literals are private', () => {
  assert.equal(isPrivateIp('2130706433'), true) // 127.0.0.1 as a single int
  assert.equal(isPrivateIp('0x7f.1'), true) // 127.0.0.1 in hex/octal parts
  assert.equal(isPrivateIp('0177.0.0.1'), true) // leading-zero octal
  assert.equal(isPrivateIp('127.1'), true) // 127.0.0.1 short form
  assert.equal(isPrivateIp('3232235521'), true) // 192.168.0.1
  // A public literal must stay public.
  assert.equal(isPrivateIp('134744072'), false) // 8.8.8.8
})
