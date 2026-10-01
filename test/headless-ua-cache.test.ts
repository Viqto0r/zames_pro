import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHeadlessUACache } from '../src/browser.ts'

test('parseHeadlessUACache: returns the UA for the same engine', () => {
  const raw = JSON.stringify({
    engine: '/opt/chrome',
    ua: 'Mozilla/5.0 Chrome/153 Safari/537.36',
  })
  assert.equal(
    parseHeadlessUACache(raw, '/opt/chrome'),
    'Mozilla/5.0 Chrome/153 Safari/537.36',
  )
})

test('parseHeadlessUACache: a different engine invalidates the cache', () => {
  const raw = JSON.stringify({ engine: '/old', ua: 'Mozilla/5.0 Chrome/1' })
  assert.equal(parseHeadlessUACache(raw, '/new'), null)
})

test('parseHeadlessUACache: rejects a cached UA that still says Headless', () => {
  const raw = JSON.stringify({
    engine: '/opt/chrome',
    ua: 'Mozilla/5.0 HeadlessChrome/153',
  })
  assert.equal(parseHeadlessUACache(raw, '/opt/chrome'), null)
})

test('parseHeadlessUACache: broken/empty input is null', () => {
  assert.equal(parseHeadlessUACache('', '/x'), null)
  assert.equal(parseHeadlessUACache('not json', '/x'), null)
  assert.equal(parseHeadlessUACache('{}', ''), null)
})
