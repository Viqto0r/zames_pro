import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanAnswer,
  isGenerationIncompleteText,
  isRateLimitText,
  isServerBusyText,
  isContextLimitText,
  isContextLimitNotice,
  normText,
  parseHeadlessUACache,
  mergeHeadlessUACache,
  sanitizeHeadlessUA,
} from '../src/browser-pure.ts'

// src/browser-pure.ts holds the state-free helpers all three provider classes
// share. browser-pure.test.ts does a spot check of a few; the ANSWER cleaning
// and the status classifiers decide whether a turn is retried, resumed or
// abandoned, so their full contract is pinned here.

test('cleanAnswer keeps the answer VERBATIM and drops a status placeholder', () => {
  // The whitespace matters for the tool-call parser, so the raw text is
  // returned unchanged (only a service placeholder becomes '').
  assert.equal(cleanAnswer('  the answer  '), '  the answer  ')
  assert.equal(cleanAnswer(''), '')
  assert.equal(cleanAnswer('Reading...'), '')
})

test('normText collapses whitespace and nbsp', () => {
  assert.equal(normText('a  b\u00a0c\nd'), 'a b c d')
  assert.equal(normText(''), '')
})

test('the rate-limit matcher needs a real notice, not a mention', () => {
  assert.equal(isRateLimitText('Messages too frequent.'), true)
  assert.equal(isRateLimitText('rate limit reached'), true)
  assert.equal(
    isRateLimitText('the code sends many requests per second'),
    false,
  )
  assert.equal(isRateLimitText(''), false)
})

test('a context-limit notice is not a rate limit and vice versa', () => {
  const notice = 'Length limit reached. Please start a new chat.'
  assert.equal(isContextLimitText(notice), true)
  assert.equal(isRateLimitText(notice), false)
  assert.equal(isContextLimitText('Messages too frequent.'), false)
  assert.equal(isRateLimitText('Messages too frequent.'), true)
})

test('the context-limit NOTICE matcher is narrower than the TEXT matcher', () => {
  // A long answer that merely says "length limit" must not be taken for the
  // server notice that ends the chat.
  assert.equal(
    isContextLimitNotice('Length limit reached. Please start a new chat.'),
    true,
  )
  assert.equal(isContextLimitText('the length limit of the array is 10'), false)
})

test('the server-busy matcher ignores a rate-limit phrase', () => {
  assert.equal(isServerBusyText('Messages too frequent.'), false)
  assert.equal(isServerBusyText('Server is busy, try again later.'), true)
})

test('the incomplete-generation matcher recognises the cut-off markers', () => {
  assert.equal(isGenerationIncompleteText(''), false)
  assert.equal(isGenerationIncompleteText('a complete answer'), false)
})

test('sanitizeHeadlessUA drops the Headless marker and keeps the version', () => {
  assert.equal(sanitizeHeadlessUA('HeadlessChrome/120'), 'Chrome/120')
  assert.equal(sanitizeHeadlessUA('Chrome/120'), 'Chrome/120')
})

test('parseHeadlessUACache reads the engine map and the legacy record', () => {
  assert.equal(parseHeadlessUACache('not json', 'chromium'), null)
  assert.equal(parseHeadlessUACache('[]', 'chromium'), null)
  assert.equal(
    parseHeadlessUACache('{"engines":{"chromium":"UA"}}', 'chromium'),
    'UA',
  )
  // A legacy single record is migrated on read too.
  assert.equal(
    parseHeadlessUACache('{"engine":"chromium","ua":"OLD"}', 'chromium'),
    'OLD',
  )
})

test('a cached Headless UA is refused (it would 403 the CDN)', () => {
  assert.equal(
    parseHeadlessUACache(
      '{"engines":{"chromium":"HeadlessChrome/1"}}',
      'chromium',
    ),
    null,
  )
})

test('mergeHeadlessUACache keeps every OTHER engine entry', () => {
  const prev = JSON.stringify({ engines: { chromium: 'a' } })
  const merged = JSON.parse(mergeHeadlessUACache(prev, 'firefox', 'b'))
  assert.deepEqual(merged, { engines: { chromium: 'a', firefox: 'b' } })
})

test('mergeHeadlessUACache migrates a legacy single record', () => {
  const prev = JSON.stringify({ engine: 'old', ua: 'oldUA' })
  const merged = JSON.parse(mergeHeadlessUACache(prev, 'new', 'newUA'))
  assert.deepEqual(merged, { engines: { old: 'oldUA', new: 'newUA' } })
})
