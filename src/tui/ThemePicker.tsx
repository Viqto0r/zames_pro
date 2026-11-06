// The theme picker — an Ink list of the bundled palettes with a LIVE preview
// line, opened by /theme (and by the /config menu's theme row).
//
// Moving the cursor APPLIES the palette immediately (the preview line and the
// widget colors repaint), so the operator judges the real look instead of
// guessing from an id; Esc puts the previous palette back. That is why the
// preview/restore callbacks are injected — this component stays a pure list.

import React, { useState } from 'react'
import { Box, Text, useInput, useApp, useWindowSize } from 'ink'
import { UI } from './ui-colors.js'
import { HintBar } from './widgets.js'
import { ThemePreview } from './theme-preview.js'
import { translate, type Locale } from '../i18n.js'

export interface ThemePickerOptions {
  /** Palette ids in display order (the first is the default). */
  themes: string[]
  /** The palette that is active on open. */
  initial: string
  /** Apply a palette as the cursor moves (live preview). */
  onPreview: (name: string) => void
  locale?: Locale
  /** Resolve with the chosen id, or null when cancelled (the caller restores
   *  the palette that was active before the picker opened). */
  onDone: (value: string | null) => void
}

export function ThemePicker({
  themes,
  initial,
  onPreview,
  locale = 'en',
  onDone,
}: ThemePickerOptions): React.ReactElement {
  const { exit } = useApp()
  const { columns, rows } = useWindowSize()
  const t = translate(locale)
  const start = Math.max(0, themes.indexOf(initial))
  const [cursor, setCursor] = useState(start)
  const innerCols = Math.max(1, (columns || 80) - 6)
  // The bundled palette list is LONGER than a terminal: rendering every id
  // pushed the title and the first palettes off the screen (Ink clips the
  // overflow) and the cursor could sit on an invisible row. Window the list
  // around the cursor; the preview and the hint bar keep their rows.
  const maxRows = Math.max(3, (rows || 24) - 14)
  const top = Math.max(0, Math.min(cursor, themes.length - maxRows))
  const shown = themes.slice(top, top + maxRows)

  const finish = (value: string | null): void => {
    onDone(value)
    exit()
  }

  const move = (dir: 1 | -1): void => {
    if (!themes.length) return
    const next = (cursor + dir + themes.length) % themes.length
    setCursor(next)
    onPreview(themes[next])
  }

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c') || input === 'q') {
      finish(null)
      return
    }
    if (key.upArrow || input === 'k') {
      move(-1)
      return
    }
    if (key.downArrow || input === 'j') {
      move(1)
      return
    }
    if (key.return) finish(themes[cursor] ?? null)
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={UI.border}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text color={UI.title} bold>
          {'◆ ' + t('theme.pick_title')}
        </Text>
        <Text color={UI.dim}>{themes.length}</Text>
      </Box>
      <Text color={UI.border}>{'─'.repeat(innerCols)}</Text>
      {shown.map((name, i) => {
        const idx = top + i
        const sel = idx === cursor
        return (
          <Text key={name}>
            <Text color={UI.accent}>{sel ? '❯ ' : '  '}</Text>
            <Text color={sel ? UI.accent : undefined} bold={sel}>
              {name}
            </Text>
            {idx === start ? (
              <Text color={UI.dim}>{'  ' + t('tui.list.current')}</Text>
            ) : null}
          </Text>
        )
      })}
      <Text color={UI.border}>{'─'.repeat(innerCols)}</Text>
      {/* The live preview: a fake session painted with the palette the cursor
          just applied, so the operator sees every role (answer, tool result,
          warn/error/success, the toggle) rather than a single sample line. */}
      <ThemePreview name={themes[cursor] ?? initial} compact />
      <HintBar
        hints={[
          ['↑/↓', t('theme.pick_move')],
          ['Enter', t('tui.hint.ok')],
          ['Esc', t('theme.pick_cancel')],
        ]}
      />
    </Box>
  )
}
