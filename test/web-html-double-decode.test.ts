import { test } from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText } from '../src/web.ts'

// Entity decoding runs as a CHAIN of global replaces, so an escaped ampersand
// (`&amp;`) is turned into a bare `&` BEFORE the numeric-entity passes run.
// The page text `&amp;#38;` means the LITERAL six characters `&#38;` (that is
// how an author shows an entity), but the chain decoded it twice and printed
// `&`. The same for `&amp;#x41;` -> `A`.

test('an escaped entity is not decoded twice', () => {
  assert.equal(htmlToText('<p>&amp;#38;</p>'), '&#38;')
  assert.equal(htmlToText('<p>&amp;#x41;</p>'), '&#x41;')
  assert.equal(htmlToText('<p>&amp;lt;</p>'), '&lt;')
})

test('a real numeric entity is still decoded', () => {
  assert.equal(htmlToText('<p>&#38;</p>'), '&')
  assert.equal(htmlToText('<p>&#x41;</p>'), 'A')
})
