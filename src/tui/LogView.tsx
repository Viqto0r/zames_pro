// The permanent scrollback log — everything that should stay on screen above
// the live input area: the operator's messages, model answers (pre-rendered
// Markdown/ANSI), tool calls and their results, warnings and per-task summaries.
//
// Rendered through Ink's <Static>, which prints each item ONCE and never
// repaints it — exactly what a growing log wants. New entries are appended to
// the store and Ink emits only the new rows.

import React from 'react'
import { Static, Box, Text } from 'ink'
import { theme } from '../theme.js'
import type { LogEntry } from './store.js'

/** One log entry. `raw` items already carry ANSI colors and are printed
 *  verbatim; structured items get a themed prefix. */
export function LogRow({ entry }: { entry: LogEntry }): React.ReactElement {
  if (entry.raw) {
    // Pre-rendered (markdown answer, tool preview). Print as-is; Ink passes
    // embedded ANSI escape sequences through to the terminal.
    return <Text>{entry.text}</Text>
  }
  switch (entry.kind) {
    case 'user':
      return <Text>{theme.user('❯ ') + entry.text}</Text>
    case 'assistant':
      return <Text>{entry.text}</Text>
    case 'tool':
      return <Text>{entry.text}</Text>
    case 'toolResult':
      return <Text>{entry.text}</Text>
    case 'warning':
      return <Text>{theme.warn(entry.text)}</Text>
    case 'summary':
      return <Text>{entry.text}</Text>
    case 'system':
    default:
      return <Text>{theme.system(entry.text)}</Text>
  }
}

/**
 * A NON-Static log list — a plain column of rows. Used in FULL-SCREEN mode,
 * where <Static> does NOT work: Static is absolutely positioned and is ignored
 * by a fixed-height flex layout (the rows would not appear inside our
 * viewport). The caller windows the entries, so only the visible slice is
 * rendered each frame.
 */
export function LogList({
  entries,
}: {
  entries: LogEntry[]
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      {entries.map((entry) => (
        <LogRow key={entry.id} entry={entry} />
      ))}
    </Box>
  )
}

/**
 * The INLINE log — rendered through Ink's <Static>, which prints each item
 * ONCE above the live area and never repaints it. This is the right tool for
 * the inline layout (the terminal keeps the scrollback), but it must NOT be
 * used inside a fixed-height flex box (see LogList).
 */
export function LogView({
  entries,
}: {
  entries: LogEntry[]
}): React.ReactElement {
  return (
    <Static items={entries}>
      {(entry) => (
        <Box key={entry.id} flexDirection="column">
          <LogRow entry={entry} />
        </Box>
      )}
    </Static>
  )
}
