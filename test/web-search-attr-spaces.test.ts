import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDuckDuckGoResults } from '../src/web.ts'

// HTML allows whitespace around `=` in an attribute (`class = "result__a"`,
// `href = "…"`) — the spec explicitly permits it, and a page served through a
// formatter/proxy does exactly that. The parser required the `=` to touch both
// the name and the value, so such a page parsed to ZERO results and WebSearch
// told the model "the output format may have changed" while the page was fine.

test('whitespace around `=` in class/href is tolerated', () => {
  const body =
    '<a class = "result__a" href = "https://a.example/x">Title</a>' +
    '<a class="result__snippet">Snip</a>'
  const r = parseDuckDuckGoResults(body, 8)
  assert.equal(r.length, 1, JSON.stringify(r))
  assert.equal(r[0].title, 'Title')
  assert.equal(r[0].url, 'https://a.example/x')
  assert.equal(r[0].snippet, 'Snip')
})

test('the normal form keeps working', () => {
  const r = parseDuckDuckGoResults(
    '<a class="result__a" href="https://b.example">T</a>',
    8,
  )
  assert.equal(r.length, 1)
  assert.equal(r[0].url, 'https://b.example')
})
