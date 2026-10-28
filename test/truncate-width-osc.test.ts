// `truncateToWidth` copies an ANSI `ESC [` (CSI) sequence whole so a cut can
// never land inside it. The OTHER escape family — OSC, `ESC ] … (BEL | ESC \\)`
// — is produced by renderMarkdown for OSC-8 hyperlinks, and it was NOT
// recognised: the scan counted the URL characters as visible columns and cut
// INSIDE the sequence. The result was a broken `\x1b]…` control prefix (and a
// link whose target/label were destroyed) whenever a markdown link line was
// clipped — e.g. a tool-result preview or a narrow pane.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateToWidth, visLen } from '../src/input/layout.ts'

const ESC = String.fromCharCode(27)
const ST = String.fromCharCode(92)
const BEL = String.fromCharCode(7)

function link(url: string, label: string): string {
  return ESC + ']8;;' + url + ESC + ST + label + ESC + ']8;;' + ESC + ST
}

function hasBrokenOsc(s: string): boolean {
  // Every OSC introducer must have a terminator (BEL or ESC \\) before the end.
  let i = 0
  while (i < s.length) {
    if (s.charCodeAt(i) === 27 && s[i + 1] === ']') {
      let j = i + 2
      let closed = false
      while (j < s.length) {
        if (s[j] === BEL) {
          closed = true
          j++
          break
        }
        if (s.charCodeAt(j) === 27 && s[j + 1] === ST) {
          closed = true
          j += 2
          break
        }
        j++
      }
      if (!closed) return true
      i = j
      continue
    }
    i++
  }
  return false
}

test('truncating an OSC-8 hyperlink never leaves a broken control prefix', () => {
  const s = link('https://example.com/very/long/url', 'docs')
  const out = truncateToWidth(s, 3)
  assert.equal(hasBrokenOsc(out), false, JSON.stringify(out))
  assert.ok(visLen(out) <= 3, 'visible width ' + visLen(out))
  assert.ok(out.endsWith('…'), out)
})

test('a BEL-terminated OSC is copied whole too', () => {
  const s = ESC + ']0;window title' + BEL + 'hello world'
  const out = truncateToWidth(s, 6)
  assert.equal(hasBrokenOsc(out), false, JSON.stringify(out))
  assert.ok(out.includes('window title'), 'the title must survive the cut')
})

test('a short link that fits is returned untouched', () => {
  const s = link('https://x.y', 'a')
  assert.equal(truncateToWidth(s, 10), s)
})
