import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDuckDuckGoResults } from '../src/web.ts'

// The result regex makes the snippet group OPTIONAL with a LAZY body. When a
// result has NO snippet, the optional group skips and the NEXT match can start
// anywhere - so the previous result's pattern reached into the FOLLOWING result
// and gave result A the snippet of result B (wrong text under a URL).
test('a result without a snippet does not borrow the next one', () => {
  const body = [
    '<a class="result__a" href="https://a.com">A</a>',
    '<a class="result__a" href="https://b.com">B</a>',
    '<a class="result__snippet">B snippet</a>',
  ].join('\n')
  const results = parseDuckDuckGoResults(body, 10)
  const a = results.find((r) => r.url === 'https://a.com')
  const b = results.find((r) => r.url === 'https://b.com')
  assert.ok(a && b)
  assert.equal(a.snippet, '')
  assert.equal(b.snippet, 'B snippet')
})

test('a normal result with its own snippet keeps it', () => {
  const body =
    '<a class="result__a" href="https://a.com">A</a>' +
    '<a class="result__snippet">A snippet</a>'
  assert.deepEqual(parseDuckDuckGoResults(body, 10), [
    { title: 'A', url: 'https://a.com', snippet: 'A snippet' },
  ])
})
