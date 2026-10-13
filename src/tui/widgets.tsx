// Reusable Ink UI WIDGETS — the building blocks that make the TUI look like a
// real app instead of plain text: checkboxes, selects, toggle rows, key hints
// and a framed panel. All pure presentational components (no terminal I/O), so
// they are reused by the config menu and any future menu (model picker, login,
// confirm dialogs).

import React from 'react'
import { Box, Text } from 'ink'

// ---- palette (kept in one place so every menu is consistent) ----
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

/** A framed panel (rounded border) with an optional title bar and footer. */
export function Panel({
  title,
  subtitle,
  footer,
  width,
  children,
}: {
  title?: string
  subtitle?: string
  footer?: React.ReactNode
  width?: number
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={UI.border}
      paddingX={1}
      width={width}
    >
      {title ? (
        <Box justifyContent="space-between">
          <Text color={UI.title} bold>
            {title}
          </Text>
          {subtitle ? <Text color={UI.dim}>{subtitle}</Text> : null}
        </Box>
      ) : null}
      {title ? <Text color="#3a3f4b">{'─'.repeat(40)}</Text> : null}
      {children}
      {footer ? footer : null}
    </Box>
  )
}

/** A single hint chip: `↑/↓ select`. */
export function Hint({
  keys,
  label,
}: {
  keys: string
  label: string
}): React.ReactElement {
  return (
    <Text>
      <Text color={UI.accent}>{keys}</Text>
      <Text color={UI.dim}>{' ' + label}</Text>
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

/**
 * A CODE BLOCK with a syntax-highlighted body and a copy affordance.
 *
 * The agent's answers are printed as pre-rendered ANSI (markdown.ts already
 * highlights with cli-highlight), so the live log does NOT use this component —
 * it exists for menus/panels that show a snippet inline (and for a future
 * structured log). Copying is a KEY, not a button: a terminal has no pointer.
 * Pass `onCopy` and show `hint` so the operator learns the binding.
 */
export function CodeBlock({
  code,
  lang,
  highlighted,
  width,
  hint,
  focused,
  onCopy,
}: {
  code: string
  lang?: string
  /** Pre-highlighted ANSI for the body; falls back to the raw `code`. */
  highlighted?: string
  width?: number
  /** e.g. "Ctrl+Y copy" — shown in the title bar when `onCopy` is set. */
  hint?: string
  focused?: boolean
  onCopy?: () => void
}): React.ReactElement {
  // React cannot call `onCopy` from a keydown here (Ink has no per-element
  // focus ring by default); the caller wires the key and passes `focused` to
  // show which block it will copy. `onCopy` is kept so a future focus manager
  // can invoke it without changing the call sites.
  void onCopy
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={focused ? UI.accent : UI.border}
      paddingX={1}
      width={width}
    >
      <Box justifyContent="space-between">
        <Text color={UI.dim}>{lang || 'code'}</Text>
        {hint ? <Text color={UI.accent}>{hint}</Text> : null}
      </Box>
      {(highlighted || code).split(String.fromCharCode(10)).map((line, i) => (
        <Text key={i}>{line || ' '}</Text>
      ))}
    </Box>
  )
}
