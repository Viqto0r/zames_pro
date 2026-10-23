import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDuckDuckGoResults } from '../src/web.ts'

// The result-anchor matcher only accepted DOUBLE-quoted `class="…"`. HTML
// allows single quotes, and a page served through a proxy / an alternate
// front-end of the same results page writes them that way. Such a page parsed
// to an EMPTY result list, and WebSearch reported "No results found. The
// DuckDuckGo output format may have changed." — a misleading message for a
// page that was parsed correctly apart from the quote style.
test('WebSearch parses a results page written with single quotes', () => {
  const body =
    "<div class='result'>" +
    "<a rel='nofollow' class='result__a' href='https://example.com/one'>One</a>" +
    "<a class='result__snippet'>Snippet one</a>" +
    "<a rel='nofollow' class='result__a' href='/l/?uddg=https%3A%2F%2Fexample.com%2Ftwo'>Two</a>" +
    '</div>'
  const results = parseDuckDuckGoResults(body, 5)
  assert.equal(results.length, 2)
  assert.equal(results[0].url, 'https://example.com/one')
  assert.equal(results[0].snippet, 'Snippet one')
  assert.equal(results[1].url, 'https://example.com/two')
})

// The DOUBLE-quoted form must keep working exactly as before.
test('WebSearch still parses the usual double-quoted markup', () => {
  const body =
    '<a class="result__a" href="https://a.com">A</a>' +
    '<a class="result__snippet">s</a>'
  const results = parseDuckDuckGoResults(body, 5)
  assert.equal(results.length, 1)
  assert.equal(results[0].url, 'https://a.com')
  assert.equal(results[0].snippet, 's')
})
