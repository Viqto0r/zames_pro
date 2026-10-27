import { test } from 'node:test'
import assert from 'node:assert/strict'
import chalk from 'chalk'
import { previewLines, themePreviewAnsi } from '../src/tui/theme-preview.tsx'
import { PALETTES, themeNames } from '../src/theme.ts'

// A picker that shows only a palette ID does not answer "what will change?".
// The preview must therefore cover the roles the operator actually sees and
// must be painted by the palette under the cursor.

test('the preview covers the important roles', () => {
  const roles = previewLines().map((l) => l.role)
  for (const r of [
    'prompt',
    'assistant',
    'tool',
    'toolResult',
    'system',
    'warn',
    'error',
    'success',
    'toggleOn',
    'dim',
  ]) {
    assert.ok(roles.includes(r as never), `preview misses the "${r}" role`)
  }
})

test('the ANSI preview is painted with the requested palette', () => {
  // chalk disables colors when stdout is not a TTY (the test runner pipes it),
  // so the level is forced here — the point of the check is the PAINTING, not
  // the terminal detection (covered by NO_COLOR tests elsewhere).
  const level = (chalk as unknown as { level: number }).level
  ;(chalk as unknown as { level: number }).level = 1
  try {
    const zames = themePreviewAnsi('zames')
    const dracula = themePreviewAnsi('dracula')
    const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')
    assert.equal(strip(zames), strip(dracula))
    assert.notEqual(zames, dracula, 'the preview was not repainted')
    assert.equal(themePreviewAnsi('no-such-theme'), zames)
  } finally {
    ;(chalk as unknown as { level: number }).level = level
  }
})

test('every shipped palette renders a preview without throwing', () => {
  for (const name of themeNames()) {
    assert.ok(themePreviewAnsi(name).length > 20, `empty preview for ${name}`)
    assert.ok(PALETTES[name].assistant, `${name} has no assistant color`)
  }
})
