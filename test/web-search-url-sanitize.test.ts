// A DuckDuckGo result link is copied into the model's context verbatim. The
// page can carry a non-http(s) href (`javascript:alert(1)` from a malicious or
// broken page) or a site-relative one (`/relative/path`), and both were passed
// through unchanged — the model was handed a `javascript:` URL as a result and
// a relative URL it cannot fetch. Only http(s) links are real results now.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDuckDuckGoResults } from '../src/web.ts'

function entry(href: string, title = 'T'): string {
  return `<a class="result__a" href="${href}">${title}</a>`
}

test('a javascript: result link is dropped', () => {
  const out = parseDuckDuckGoResults(
    entry('javascript:alert(1)', 'JS') + entry('https://ok.example/x', 'Ok'),
    10,
  )
  assert.deepEqual(
    out.map((r) => r.url),
    ['https://ok.example/x'],
  )
})

test('a relative result link is dropped', () => {
  const out = parseDuckDuckGoResults(entry('/relative/path', 'Rel'), 10)
  assert.equal(out.length, 0)
})

test('a data: result link is dropped', () => {
  const out = parseDuckDuckGoResults(entry('data:text/html,<b>x</b>', 'D'), 10)
  assert.equal(out.length, 0)
})

test('http and https links are kept', () => {
  const out = parseDuckDuckGoResults(
    entry('http://a.example/') + entry('https://b.example/'),
    10,
  )
  assert.deepEqual(
    out.map((r) => r.url),
    ['http://a.example/', 'https://b.example/'],
  )
})
