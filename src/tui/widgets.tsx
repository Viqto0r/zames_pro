// Reusable Ink UI WIDGETS — the building blocks that make the TUI look like a
// real app instead of plain text: checkboxes, selects and key-hint rows. All
// pure presentational components (no terminal I/O), so they are reused by the
// config menu and any future menu (model picker, login, confirm dialogs).

import React from 'react'
import { Text } from 'ink'

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
