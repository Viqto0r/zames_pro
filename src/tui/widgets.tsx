// Reusable Ink UI WIDGETS — the building blocks that make the TUI look like a
// real app instead of plain text: checkboxes, selects and key-hint rows. All
// pure presentational components (no terminal I/O), so they are reused by the
// config menu and any future menu (model picker, login, confirm dialogs).

import React from 'react'
import { Text } from 'ink'

export const UI = {
  accent: '#c8b06a',
  accentDim: '#7a6b45',
  text: '#cfc9b0',
  dim: '#5b616e',
  border: '#4a5058',
  on: '#6fd0b0',
  off: '#5b616e',
  ok: '#a9c08c',
  warn: '#c9a86a',
  err: '#c98a80',
  system: '#808896',
  title: '#9fb8d8',
} as const

/** `[x]` / `[ ]` — a checkbox for a boolean value. */
export function Checkbox({
  checked,
  focused,
}: {
  checked: boolean
  focused?: boolean
}): React.ReactElement {
  return (
    <Text color={checked ? UI.on : UI.off} bold={focused}>
      {checked ? '[x]' : '[ ]'}
    </Text>
  )
}

/** `‹ value ›` — an inline SELECT for an enum value. The arrows hint that
 *  ←/→ (or Space) cycle the option. */
export function Select({
  value,
  focused,
}: {
  value: string
  focused?: boolean
}): React.ReactElement {
  return (
    <Text>
      <Text color={UI.off}>{'‹ '}</Text>
      <Text color={focused ? UI.accent : UI.text} bold={focused}>
        {value}
      </Text>
      <Text color={UI.off}>{' ›'}</Text>
    </Text>
  )
}

/** A row of hint chips separated by ` · `. */
export function HintBar({
  hints,
}: {
  hints: Array<[string, string]>
}): React.ReactElement {
  return (
    <Text>
      {hints.map(([k, l], i) => (
        <Text key={i}>
          {i > 0 ? <Text color={UI.dim}>{'  ·  '}</Text> : null}
          <Text color={UI.accent}>{k}</Text>
          <Text color={UI.dim}>{' ' + l}</Text>
        </Text>
      ))}
    </Text>
  )
}
