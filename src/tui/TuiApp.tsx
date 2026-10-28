// The Ink APP ROOT — composes the permanent log, the live status bar and the
// input line into one flex column, and SUBSCRIBES to the TuiStore itself via
// `useSyncExternalStore`.
//
// Subscribing inside the tree (not by passing `state` as a prop) means the
// adapter calls `render()` exactly once and every store mutation re-renders
// only the components that read the changed slice. The top section is <Static>
// (never repainted), the bottom section re-renders as state changes, so the
// input stays pinned at the bottom while answers scroll up into scrollback.

import React, { useSyncExternalStore } from 'react'
import { Box, useWindowSize } from 'ink'
import { LogView } from './LogView.js'
import { StatusBar } from './StatusBar.js'
import { InputLine, type InputLineProps } from './InputLine.js'
import { suggestRowCount } from '../input/suggest.js'
import { screenGutter, screenInnerCols } from '../input/layout.js'
import type { TuiStore } from './store.js'

export type InputCallbacks = Omit<
  InputLineProps,
  'locale' | 'commands' | 'prompt' | 'locked' | 'store'
>

export function TuiApp({
  store,
  inputProps,
  initialPrintedCount = 0,
}: {
  store: TuiStore
  inputProps: InputCallbacks
  /**
   * How many log entries were ALREADY printed to the terminal before this
   * mount (e.g. a pause/resume cycle). <Static> would reprint every item it
   * is given, so we pass only the entries added AFTER that watermark —
   * otherwise resuming after the /config menu duplicated the whole scrollback.
   */
  initialPrintedCount?: number
}): React.ReactElement {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  // The watermark is fixed for the lifetime of this mount.
  const [watermark] = React.useState(initialPrintedCount)
  const entries = watermark > 0 ? state.log.slice(watermark) : state.log
  // Cursor rows above the input box in the INLINE live area: divider + status
  // + the suggestion popup (which renders above the box and would otherwise
  // shift the caret down by its row count). Without the suggestRows term the
  // caret drifted whenever the «/» list opened.
  // The INLINE layout needs the same gutter the full-screen one has: the
  // operator's complaint was that switching a theme made the flush edges
  // obvious (the themed background only covers what we paint). The width fed
  // to the suggest-row math must match the padded pane, or the caret drifts.
  const gutter = screenGutter(useWindowSize().columns || 80)
  const cols = screenInnerCols(useWindowSize().columns || 80)
  const suggestRows = suggestRowCount(state.edit.buf, state.commands, cols)
  return (
    <Box flexDirection="column" paddingLeft={gutter} paddingRight={gutter}>
      <LogView entries={entries} />
      <StatusBar state={state} />
      <InputLine
        {...inputProps}
        store={store}
        prompt={state.prompt}
        locale={state.locale}
        commands={state.commands}
        locked={state.locked}
        // 3 = divider + status + the box TOP border. The popup sits ABOVE
        // the box and does not move it, so it must not shift the caret.
        cursorTop={3}
      />
    </Box>
  )
}
