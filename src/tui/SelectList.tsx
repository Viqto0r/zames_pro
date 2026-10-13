// A reusable Ink SELECT LIST — a scrollable, keyboard-navigable list of items
// with a title and an optional detail/description per row. Used by the model
// picker and any future list menu (chats, sessions, ...).

import React, { useMemo, useState } from 'react'
import { Box, Text, useInput, useApp, useWindowSize } from 'ink'
import { UI, HintBar } from './widgets.js'

export interface SelectItem {
  value: string
  label: string
  /** Optional right-aligned detail (e.g. "current", a model id). */
  detail?: string
  /** Optional dim description shown under the selected label. */
  description?: string
}

export interface SelectListOptions {
  title: string
  items: SelectItem[]
  /** Value highlighted on open. */
  initial?: string
  /** Resolve with the chosen value, or null on Esc/Ctrl+C. */
  onSelect: (value: string | null) => void
}

export function SelectList({
  title,
  items,
  initial,
  onSelect,
}: SelectListOptions): React.ReactElement {
  const { exit } = useApp()
  const { rows } = useWindowSize()
  const start = Math.max(
    0,
    items.findIndex((it) => it.value === initial),
  )
  const [cursor, setCursor] = useState(start)
  const maxRows = Math.max(3, (rows || 24) - 7)

  const win = useMemo(() => {
    let top = Math.max(0, cursor - maxRows + 1)
    if (cursor < top) top = cursor
    return { top, end: Math.min(items.length, top + maxRows) }
  }, [cursor, items.length, maxRows])

  const finish = (value: string | null): void => {
    onSelect(value)
    exit()
  }

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c') || input === 'q') {
      finish(null)
      return
    }
    if (key.upArrow || input === 'k') {
      setCursor((c) =>
        items.length ? (c - 1 + items.length) % items.length : 0,
      )
      return
    }
    if (key.downArrow || input === 'j') {
      setCursor((c) => (items.length ? (c + 1) % items.length : 0))
      return
    }
    if (key.return) {
      finish(items[cursor]?.value ?? null)
    }
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
          {'◆ ' + title}
        </Text>
        <Text color={UI.dim}>{items.length}</Text>
      </Box>
      <Text color="#3a3f4b">{'─'.repeat(40)}</Text>
      {items.slice(win.top, win.end).map((it, i) => {
        const idx = win.top + i
        const sel = idx === cursor
        return (
          <Text key={it.value}>
            <Text color={UI.accent}>{sel ? '❯ ' : '  '}</Text>
            <Text color={sel ? UI.accent : undefined} bold={sel}>
              {it.label}
            </Text>
            {it.detail ? <Text color={UI.dim}>{'  ' + it.detail}</Text> : null}
          </Text>
        )
      })}
      <HintBar
        hints={[
          ['↑/↓', 'выбор'],
          ['Enter', 'ok'],
          ['Esc', 'отмена'],
        ]}
      />
    </Box>
  )
}
