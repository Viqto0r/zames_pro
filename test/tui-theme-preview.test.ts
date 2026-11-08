import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewLines, themePreviewAnsi } from '../src/tui/theme-preview.tsx'
import { ALL_PALETTES, DEFAULT_THEME } from '../src/theme.ts'

// The theme picker shows a SAMPLE of the palette before the operator switches:
// a theme that paints the operator's own turn or the input frame unreadable
// must be visible in the picker, not only after switching. The sample is pure
// data, so it is pinned here.

test('every previewed role exists in every palette', () => {
  const lines = previewLines()
  assert.ok(lines.length >= 10, 'the sample must cover the main surfaces')
  for (const name of Object.keys(ALL_PALETTES) as Array<
    keyof typeof ALL_PALETTES
  >) {
    for (const l of lines) {
      const c = ALL_PALETTES[name][l.role]
      assert.match(String(c), /^#[0-9a-f]{6}$/i, name + '/' + l.role)
    }
  }
})

test('the sample includes the operator turn and the input frame', () => {
  const roles = previewLines().map((l) => l.role)
  for (const r of ['user', 'userBar', 'turnRule', 'assistant', 'tool']) {
    assert.ok(roles.includes(r as never), r)
  }
})

test('only the prompt line is bold', () => {
  const bold = previewLines()
    .filter((l) => l.bold)
    .map((l) => l.role)
  assert.deepEqual(bold, ['prompt'])
})

test('the ANSI preview has one line per sample and no empty line', () => {
  const out = themePreviewAnsi(DEFAULT_THEME)
  const lines = out.split(String.fromCharCode(10))
  assert.equal(lines.length, previewLines().length)
  assert.ok(lines.every((l) => l.length > 0))
})

test('an unknown theme name falls back to the default palette', () => {
  assert.equal(themePreviewAnsi('nope'), themePreviewAnsi(DEFAULT_THEME))
})
