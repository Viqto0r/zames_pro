// The BANNER box measures each line with `width()`, which strips only CSI
// (`ESC [`) escapes. A line carrying an OSC sequence — an OSC-8 hyperlink, or
// a terminal-title set — had its whole BODY counted as visible columns, so the
// box was drawn too wide and its content mis-padded. The same CSI-only rule
// sits in the config menu (which erases its block by a VISUAL-line count
// computed the same way, leaving duplicated rows) and in `clip()` here, which
// then cuts INSIDE the OSC.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderStartupBanner, clipToWidth } from '../src/banner.ts'

const ESC = String.fromCharCode(27)
const ST = String.fromCharCode(92)

function plain(s: string): string {
  return s
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
}

function firstRowWidth(s: string): number {
  return Array.from(plain(s).split('\n')[0]).length
}

test('an OSC hyperlink does not widen the banner box', () => {
  const link = ESC + ']8;;https://example.com/a/very/long/url' + ESC + ST
  const close = ESC + ']8;;' + ESC + ST
  const base = { version: '1.0', workdir: 'w', provider: 'p' }
  const withLink = renderStartupBanner(
    { ...base, title: 'a ' + link + 'b' + close },
    80,
  )
  const without = renderStartupBanner({ ...base, title: 'a b' }, 80)
  assert.equal(
    firstRowWidth(withLink),
    firstRowWidth(without),
    JSON.stringify(plain(withLink)),
  )
})

test('clip keeps an OSC escape whole', () => {
  const link = ESC + ']8;;https://example.com/x' + ESC + ST
  const close = ESC + ']8;;' + ESC + ST
  const out = clipToWidth('abcdef ' + link + 'label' + close, 8)
  const opens = (out.match(/\x1b\]/g) || []).length
  const closes = (out.match(/\x1b\\/g) || []).length
  assert.equal(opens, closes, JSON.stringify(out))
})
