// renderStartupBanner(info, contentWidth) is called with the SHARED content
// width, and a caller may legitimately pass 0 ("auto") or a tiny value on a
// narrow terminal. The box computed its inner width as
// `Math.min(maxWidth - 4, ...)`: with maxWidth < 4 that goes NEGATIVE, the
// clamp to 10 keeps the frame, but every content line is then clipped to
// `inner - 2` which is fine — the REAL break was maxWidth = 0 used with the
// banner's own default, where `-4` produced a 10-wide box whose content was
// clipped to "…" and the title/version/directory disappeared entirely.
// A zero/negative width must fall back to a sensible default instead.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderStartupBanner } from '../src/banner.ts'

const info = {
  title: 'zames',
  version: '9.9.9',
  workdir: '/w',
  provider: 'DeepSeek',
}

test('a zero content width still renders the real fields', () => {
  const out = renderStartupBanner(info, 0)
  assert.ok(out.includes('zames'), out)
  assert.ok(out.includes('9.9.9'), out)
  assert.ok(out.includes('/w'), out)
  assert.ok(!out.includes('…'), out)
})

test('a negative content width still renders the real fields', () => {
  const out = renderStartupBanner(info, -20)
  assert.ok(out.includes('zames'), out)
  assert.ok(out.includes('DeepSeek'), out)
})

test('a narrow but valid width still clips with an ellipsis', () => {
  const out = renderStartupBanner(info, 20)
  assert.ok(out.includes('…'), out)
})
