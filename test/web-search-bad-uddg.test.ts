// DuckDuckGo wraps result links in a `/l/?uddg=<url-encoded>` redirect. The
// parser decodes that parameter with `decodeURIComponent`, which THROWS on a
// malformed percent escape (`%ZZ`, a lone `%`). The exception escaped the pure
// parser, so ONE broken href in the page aborted the WHOLE search — the model
// got `Search error: URI malformed` instead of the other, valid results.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDuckDuckGoResults } from '../src/web.ts'

function entry(href: string, title = 'T'): string {
  return `<a class="result__a" href="${href}">${title}</a>`
}

test('a malformed uddg escape does not abort the whole parse', () => {
  const body =
    entry('/l/?uddg=https%3A%2F%2Fbad.example%2F%ZZ', 'Broken') +
    entry('https://ok.example/x', 'Ok')
  const out = parseDuckDuckGoResults(body, 10)
  assert.deepEqual(
    out.map((r) => r.url),
    ['https://ok.example/x'],
  )
})

test('a lone percent sign in uddg does not throw', () => {
  const body = entry('/l/?uddg=https%3A%2F%2Fbad.example%2F%', 'Broken')
  assert.doesNotThrow(() => parseDuckDuckGoResults(body, 10))
})
