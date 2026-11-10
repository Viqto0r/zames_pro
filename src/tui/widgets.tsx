// Reusable Ink UI WIDGETS — the building blocks that make the TUI look like a
// real app instead of plain text: checkboxes, selects and key-hint rows. All
// pure presentational components (no terminal I/O), so they are reused by the
// config menu and any future menu (model picker, login, confirm dialogs).

import React from 'react'
import { Text, useWindowSize } from 'ink'
import { truncateToWidth, visLen } from '../input/layout.js'

// The color map lives in ui-colors.ts because it is DERIVED from the active
// terminal palette and mutated in place on a /config theme switch. Re-exported
// here so every existing `import { UI } from './widgets.js'` keeps working.
export { UI } from './ui-colors.js'
import { UI } from './ui-colors.js'

/** `[x]` / `[ ]` — a checkbox for a boolean value. */
export function Checkbox({
  checked,
  focused,
}: {
  checked: boolean
  focused?: boolean
}): React.ReactElement {
  // A checkbox is ONE unit: `[x]`/`[ ]` must not change color inside the
  // brackets — an unchecked box used to render as two overlapping `[ ]` glyphs
  // because the three parts were painted with different colors.
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
  // A single Text: one SGR run per glyph (`‹` + value + `›`) let some terminals
  // render the arrows as a SECOND row of the same cell, and on a LIGHT palette
  // the dim `off` color made the arrows nearly invisible. One run, one color.
  return (
    <Text color={focused ? UI.accent : UI.text} bold={focused}>
      {'‹ ' + value + ' ›'}
    </Text>
  )
}

/**
 * A row of hint chips separated by ` · `.
 *
 * The row is ONE line by contract: a modal reserves a single row for it, and
 * the config menu passes SEVEN chips (in Russian that is ~111 columns). Left
 * unclipped, Ink wrapped the row and the extra line shifted the border and the
 * input rows by one. The chips are measured and the tail is dropped (with an
 * ellipsis) so the row never wraps.
 */
export function HintBar({
  hints,
  maxCols,
}: {
  hints: Array<[string, string]>
  /** Width to fit; defaults to the terminal width minus one safety column. */
  maxCols?: number
}): React.ReactElement {
  const { columns } = useWindowSize()
  const limit = Math.max(10, maxCols ?? Math.max(1, (columns || 80) - 1))
  const chips: Array<{ key: string; label: string; text: string }> = []
  let used = 0
  for (let i = 0; i < hints.length; i++) {
    const [key, label] = hints[i]
    const text = key + ' ' + label
    const sep = i > 0 ? '  ·  ' : ''
    // Measure in VISIBLE columns so a wide glyph is not undercounted.
    const add = visLen(sep) + visLen(text)
    if (used + add > limit && chips.length) break
    used += add
    chips.push({ key, label, text })
  }
  const dropped = chips.length < hints.length
  // Reserve one column for the marker when the tail was dropped.
  const body = chips.map((c) => c.text).join('  ·  ')
  const clipped = truncateToWidth(body, dropped ? limit - 2 : limit)
  return (
    <Text>
      {clipped.split('  ·  ').map((chip, i) => (
        <Text key={i}>
          {i > 0 ? <Text color={UI.dim}>{'  ·  '}</Text> : null}
          <Text color={UI.accent}>{chip.split(' ')[0]}</Text>
          <Text color={UI.dim}>{chip.slice(chip.indexOf(' '))}</Text>
        </Text>
      ))}
      {dropped ? <Text color={UI.dim}>{' …'}</Text> : null}
    </Text>
  )
}
