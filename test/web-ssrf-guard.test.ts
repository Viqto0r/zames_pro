import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isPrivateIp,
  isPrivateHostname,
  isBinaryContentType,
  htmlToText,
} from '../src/web.ts'

// test/web.test.ts and its siblings pin htmlToText and the DuckDuckGo parser.
// The SSRF GUARD — the one thing that stops the model from reading cloud
// metadata or an internal admin panel through WebFetch — was only exercised
// indirectly. A hole here is a real vulnerability, so every tolerated spelling
// of a private address is pinned.

test('every non-canonical spelling of 127.0.0.1 is caught', () => {
  for (const ip of [
    '127.0.0.1',
    '127.1',
    '2130706433',
    '0x7f.1',
    '0177.0.0.1',
    '0:0:0:0:0:0:0:1',
    '::1',
    '::',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:0:7f00:1',
    '2002:7f00:1::',
    '64:ff9b::7f00:1',
    '::127.0.0.1',
  ]) {
    assert.equal(isPrivateIp(ip), true, ip)
  }
})

test('the RFC1918 / CGNAT / link-local ranges are private', () => {
  for (const ip of [
    '10.1.2.3',
    '192.168.1.1',
    '172.16.0.1',
    '172.31.255.255',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',
    '0.0.0.0',
  ]) {
    assert.equal(isPrivateIp(ip), true, ip)
  }
  // Just OUTSIDE the ranges: 172.15/172.32, 100.128, a public address.
  for (const ip of ['172.15.0.1', '172.32.0.1', '100.128.0.1', '8.8.8.8']) {
    assert.equal(isPrivateIp(ip), false, ip)
  }
})

test('IPv6 link-local / ULA / multicast and the expanded forms', () => {
  for (const ip of [
    'fe80::1',
    'fe90::1',
    'febf::1',
    'fc00::1',
    'fd12::1',
    'ff02::1',
  ]) {
    assert.equal(isPrivateIp(ip), true, ip)
  }
  // A malformed literal is not an address (and is not private).
  for (const ip of ['1.2.3.4.5', 'hello', '']) {
    assert.equal(isPrivateIp(ip), false, JSON.stringify(ip))
  }
})

test('the internal hostname aliases are blocked', () => {
  for (const h of [
    'localhost',
    'LOCALHOST.',
    'app.localhost',
    'metadata.google.internal',
    'metadata',
    'instance-data',
    'kubernetes.default',
    'kubernetes.default.svc',
    'svc.internal',
    'printer.local',
    'x.home.arpa',
    '',
  ]) {
    assert.equal(isPrivateHostname(h), true, h)
  }
  for (const h of ['8.8.8.8', 'example.com', 'notinternal']) {
    assert.equal(isPrivateHostname(h), false, h)
  }
})

test('textual application types are readable, binaries are not', () => {
  for (const ct of [
    'text/html',
    'text/plain; charset=utf-8',
    'application/json',
    'application/vnd.api+json',
    'application/xml',
    'application/x-yaml',
    'application/ld+json',
    '',
  ]) {
    assert.equal(isBinaryContentType(ct), false, JSON.stringify(ct))
  }
  for (const ct of [
    'image/png',
    'application/pdf',
    'APPLICATION/OCTET-STREAM',
    'audio/mpeg',
    'font/woff2',
  ]) {
    assert.equal(isBinaryContentType(ct), true, ct)
  }
})

test('htmlToText drops page chrome and never double-decodes an entity', () => {
  const out = htmlToText(
    '<head><title>T</title></head><body><p>Hi &amp;#38; there</p>' +
      '<table><tr><td>A</td><td>B</td></tr></table>' +
      '<pre>if (a < b) x</pre></body>',
  )
  // The title is chrome, not content.
  assert.ok(!out.includes('T'), out)
  // `&amp;#38;` is the LITERAL text `&#38;`, decoded exactly once.
  assert.match(out, /Hi &#38; there/)
  // Table cells keep a separating space; a <pre> keeps its bare `<`.
  assert.match(out, /A B/)
  assert.match(out, /if \(a < b\) x/)
})
