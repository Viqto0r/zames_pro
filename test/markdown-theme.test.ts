import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/markdown.ts'
import { applyTheme } from '../src/theme.ts'

// The answers used to keep hardcoded hex colors (src/markdown.ts froze its theme
// at import time), so a /theme switch repainted the chrome but NOT the model's
// answer or the operator's echoed text — the reported "the answer keeps the old
// color". These tests pin the answer renderer to the LIVE palette.

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

/** The truecolor foreground sequences emitted for a rendered answer. */
function truecolors(s: string): string[] {
  return [...s.matchAll(/\x1b\[38;2;(\d+;\d+;\d+)m/g)].map((m) => m[1])
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ].join(';')
}

const answer = [
  '# Heading',
  '',
  'Body with `inline code` and a [link](https://example.com).',
  '',
  '```js',
  'const x = 1',
  '```',
].join(String.fromCharCode(10))

test('a theme switch repaints the model answer', () => {
  applyTheme('zames')
  const a = truecolors(renderMarkdown(answer))
  applyTheme('dracula')
  const b = truecolors(renderMarkdown(answer))
  assert.ok(a.length > 0, 'the answer carried no colors at all')
  assert.notDeepEqual(a, b, 'the answer kept the previous palette')
  applyTheme('zames')
})

test('the answer colors come from the active palette', () => {
  applyTheme('gruvbox')
  try {
    const out = renderMarkdown(answer)
    const used = truecolors(out)
    // The heading uses the palette's taskSummary color.
    assert.ok(
      used.includes(hexToRgb('#8ec07c')),
      'the gruvbox heading color is missing from the answer',
    )
    // The text itself must survive (a palette switch must not eat content).
    assert.ok(stripAnsi(out).includes('Body with inline code'))
  } finally {
    applyTheme('zames')
  }
})

test('code highlighting never falls back to cli-highlight default colors', () => {
  // The default theme uses chalk's NAMED colors (SGR 34/36/31...). Any of them
  // in a rendered block means the palette was bypassed.
  applyTheme('nord')
  try {
    const out = renderMarkdown('```js\nconst x = 1 // note\n```')
    const named = [...out.matchAll(/\x1b\[(3[0-7])m/g)].map((m) => m[1])
    assert.deepEqual(named, [], 'named chalk colors leaked into a code block')
    assert.ok(stripAnsi(out).includes('const x = 1'))
  } finally {
    applyTheme('zames')
  }
})

test('NO_COLOR still drops every color from the answer', () => {
  const prev = process.env.NO_COLOR
  process.env.NO_COLOR = '1'
  try {
    assert.equal(renderMarkdown('# T'), '# T')
  } finally {
    if (prev === undefined) delete process.env.NO_COLOR
    else process.env.NO_COLOR = prev
  }
})
