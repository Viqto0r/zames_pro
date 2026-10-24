// DuckDuckGo can repeat the SAME result on one page (a sponsored row mirroring
// an organic one, a duplicated block). parseDuckDuckGoResults kept both, so
// WebSearch printed the same URL twice and the model cited a source twice.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDuckDuckGoResults } from '../src/web.ts'

test('a duplicated result URL is kept once', () => {
  const html =
    '<a class="result__a" href="https://a.com">A</a>' +
    '<a class="result__snippet">s1</a>' +
    '<a class="result__a" href="https://a.com">A again</a>' +
    '<a class="result__snippet">s2</a>'
  const out = parseDuckDuckGoResults(html, 5)
  assert.equal(out.length, 1, 'duplicate: ' + JSON.stringify(out))
  assert.equal(out[0].url, 'https://a.com')
})

test('distinct results are kept (control)', () => {
  const html =
    '<a class="result__a" href="https://a.com">A</a>' +
    '<a class="result__a" href="https://b.com">B</a>'
  assert.equal(parseDuckDuckGoResults(html, 5).length, 2)
})
