import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateHostname } from '../src/web.ts'

// The cloud metadata endpoint is commonly reached by a bare ALIAS, not just by
// its IP or the long `metadata.google.internal` name: GCP documents `metadata`,
// AWS documents `instance-data`, and Kubernetes resolves `kubernetes.default`.
// These are names DNS keeps on the internal network, so the SSRF guard must
// refuse them by NAME (a split-horizon resolver or a DNS failure may otherwise
// let fetch() reach the metadata service).
test('isPrivateHostname blocks the bare metadata / instance-data aliases', () => {
  assert.equal(isPrivateHostname('metadata'), true)
  assert.equal(isPrivateHostname('instance-data'), true)
  assert.equal(isPrivateHostname('metadata.google.internal'), true)
})

test('isPrivateHostname blocks kubernetes service names', () => {
  assert.equal(isPrivateHostname('kubernetes.default'), true)
  assert.equal(isPrivateHostname('kubernetes.default.svc'), true)
})

test('a normal public host is still allowed', () => {
  assert.equal(isPrivateHostname('example.com'), false)
  assert.equal(isPrivateHostname('metadata.example.com'), false)
})
