import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateIp, isPrivateHostname } from '../src/web.ts'

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
  assert.equal(isPrivateIp('2001:4860:4860::8888'), false)
})

test('isPrivateIp: IPv4-mapped IPv6', () => {
  assert.equal(isPrivateIp('::ffff:127.0.0.1'), true)
  assert.equal(isPrivateIp('::ffff:8.8.8.8'), false)
})

test('isPrivateHostname blocks localhost and metadata host', () => {
  assert.equal(isPrivateHostname('localhost'), true)
  assert.equal(isPrivateHostname('foo.localhost'), true)
  assert.equal(isPrivateHostname('metadata.google.internal'), true)
  assert.equal(isPrivateHostname('example.com'), false)
  assert.equal(isPrivateHostname(''), true)
})
