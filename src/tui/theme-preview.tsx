// Renders a TERMINAL PREVIEW of a theme: a small fake session painted with the
// palette, so /theme (and the config menu) can show what will actually change
// instead of only a palette id.
//
// Two renderings of the same content:
//   - `themePreviewAnsi(name)` — a chalk string for a plain terminal line;
//   - `ThemePreview` — an Ink component for the picker (Ink <Text color> needs
//     hex strings, so this one goes through `PALETTES[name]` directly).
//
// Both draw the SAME roles (prompt/dir, answer, tool+result, system, warn,
// error, success, a toggle) — if a role is missing from the preview the operator
// cannot judge the theme.

import React from 'react'
import { Box, Text } from 'ink'
import chalk from 'chalk'
import { ALL_PALETTES, DEFAULT_THEME, isThemeName } from '../theme.js'
import type { Palette } from '../theme.js'

export interface PreviewLine {
  /** The role whose color paints this line (a named Palette key). */
  role: Exclude<keyof Palette, number>
  text: string
  bold?: boolean
}

/**
 * The sample lines. Kept PURE DATA so tests can assert the preview covers the
 * important roles and the Ink/plain renderers cannot drift apart.
 */
export function previewLines(): PreviewLine[] {
  return [
    { role: 'dir', text: '~/project' },
    { role: 'prompt', text: '❯ объясни этот код', bold: true },
    { role: 'assistant', text: '● Ответ: функция читает файл и парсит JSON.' },
    { role: 'tool', text: '🔧 Read {"path":"package.json"}' },
    { role: 'toolResult', text: '→ ✔ 42 строки' },
    { role: 'taskSummary', text: '· duration: 6s · tools: 1' },
    { role: 'warn', text: '▲ предупреждение' },
    { role: 'error', text: '✖ ошибка' },
    { role: 'success', text: '✔ готово' },
    { role: 'toggleOn', text: '🌐 поиск вкл' },
    { role: 'system', text: '● сервисное сообщение' },
    { role: 'dim', text: '· подсказка' },
  ]
}

function paletteOf(name: unknown): Palette {
  return ALL_PALETTES[isThemeName(name) ? name : DEFAULT_THEME]
}

/** The preview as one chalk-painted string (for a plain terminal line). */
export function themePreviewAnsi(name: unknown): string {
  const p = paletteOf(name)
  return previewLines()
    .map((l) => {
      const c = chalk.hex(p[l.role])
      return l.bold ? c.bold(l.text) : c(l.text)
    })
    .join('\n')
}

/** The preview as an Ink block (for the picker / the config menu). */
export function ThemePreview({
  name,
  compact = false,
}: {
  name: string
  /** One line per role is long; compact shows the 6 most telling roles. */
  compact?: boolean
}): React.ReactElement {
  const p = paletteOf(name)
  const lines = compact
    ? previewLines().filter((l) =>
        ['prompt', 'assistant', 'tool', 'error', 'success', 'dim'].includes(
          l.role,
        ),
      )
    : previewLines()
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => (
        <Text key={i} color={p[l.role]} bold={l.bold}>
          {l.text}
        </Text>
      ))}
    </Box>
  )
}
