// The FULL-SCREEN app layout (used when `ui.alternateScreen` is on).
//
// Unlike the inline layout (where Ink prints the log as <Static> scrollback),
// here the WHOLE terminal is ours: a header at the top, a SCROLLABLE log
// viewport in the middle and the live panel pinned at the bottom. There is no
// terminal reflow to fight, so a resize never leaves ghost lines — this is the
// layout Codex / opencode / Claude Code use.
//
// Scrolling: the viewport shows the newest content by default (scroll = 0);
// PgUp/PgDn (and the wheel) move a `scroll` offset in the store.

import React, { useSyncExternalStore } from 'react'
import { Box, Text, useWindowSize, useInput } from 'ink'
import { LogList } from './LogView.js'
import { windowByRows, totalRows } from './log-window.js'
import { StatusBar } from './StatusBar.js'
import { InputLine, type InputLineProps } from './InputLine.js'
import type { TuiStore } from './store.js'
import { translate } from '../i18n.js'
import { suggestRowCount } from '../input/suggest.js'
import { truncateToWidth, visLen } from '../input/layout.js'
import { fullScreenLayout } from './layout.js'
import { useMouseWheel } from './useMouseWheel.js'
import { UI, inputBorderCols } from './ui-colors.js'

export type FullInputCallbacks = Omit<
  InputLineProps,
  'locale' | 'commands' | 'prompt' | 'locked' | 'store'
>

/** The header bar: title, version, working directory. */
function Header({ store }: { store: TuiStore }): React.ReactElement {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const cols = Math.max(1, useWindowSize().columns || 80)
  const right = [state.provider && '[' + state.provider + ']']
    .filter(Boolean)
    .join(' ')
  const left = '❯ ' + state.title + (state.version ? ' v' + state.version : '')
  // Referencing the nonce keeps the React dependency honest: the header colors
  // come from the shared UI map, which is mutated in place on a theme switch.
  void state.themeNonce
  const rawDir = state.workdir ? '  ' + state.workdir : ''
  // The header MUST stay exactly ONE text row: FullScreenApp reserves
  // HEADER_ROWS = 2 (title + divider) and the whole panel height is computed
  // from it. A long working directory used to WRAP the title row at a narrow
  // terminal (or a deep path), adding a third row the layout did not know
  // about — Ink then overflowed the fixed `height={termRows}` column and the
  // TOP input row was clipped (the operator saw the second line overprint the
  // first). Truncate the directory (then the title) so the row always fits.
  const gap = Math.max(
    1,
    cols - visLen(left) - visLen(rawDir) - visLen(right) - 2,
  )
  let dir = rawDir
  const budget = cols - visLen(left) - visLen(right) - 2
  if (visLen(dir) > budget) dir = budget > 0 ? truncateToWidth(dir, budget) : ''
  // If even title + provider exceed the width, drop the directory entirely.
  const finalDir = gap >= 1 ? dir : ''
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={UI.accent} bold>
          {left}
        </Text>
        <Text color={UI.accent}>{finalDir}</Text>
        <Text>
          {' '.repeat(
            Math.max(
              1,
              cols - visLen(left) - visLen(finalDir) - visLen(right) - 2,
            ),
          )}
        </Text>
        {right ? <Text color={UI.on}>{right}</Text> : null}
      </Box>
      <Text color={UI.border}>{'─'.repeat(cols)}</Text>
    </Box>
  )
}

export function FullScreenApp({
  store,
  inputProps,
}: {
  store: TuiStore
  inputProps: FullInputCallbacks
}): React.ReactElement {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { rows } = useWindowSize()
  const termRows = rows || 24

  // ONE pure helper owns the panel arithmetic, so the reserved rows and the
  // caret row can never drift apart (the component used to compute them
  // separately and the caret landed below the input box when the panel filled
  // the terminal).
  const cols = Math.max(1, useWindowSize().columns || 80)
  const fsLayout = fullScreenLayout({
    termRows,
    cols,
    prompt: state.prompt,
    buf: state.edit.buf,
    cursor: state.edit.cursor,
    suggestRows: suggestRowCount(state.edit.buf, state.commands, cols),
    borderCols: inputBorderCols(),
  })
  const logHeight = fsLayout.logHeight

  // Window the log BY RENDERED ROW: a long wrapped answer can be taller than
  // one entry, and an entry-count window either overflowed the panel or left
  // it half empty. `scroll` is measured in ROWS here (0 = newest at the
  // bottom).
  const all = state.log
  // The scroll bound uses the EXACT row count: it is what the content really
  // renders, so the newest row stays reachable. (Reserving the viewport with
  // the floor is a separate concern, handled in `fullScreenLayout`.)
  const total = totalRows(all, cols)
  const maxScroll = Math.max(0, total - logHeight)
  const scroll = Math.max(0, Math.min(state.scroll, maxScroll))
  const visible = windowByRows(all, logHeight, scroll, cols)
  // Scroll the log with PgUp/PgDn; Home/End jump to the very top/bottom. The
  // input line OWNS Home/End while its buffer is non-empty (they move the
  // caret), so the jump only applies to an EMPTY buffer — which is exactly
  // when the operator is navigating the log to select a large block.
  //
  // `useInput` binds the callback ONCE, so a `scroll` captured in the closure
  // goes STALE after the first scroll (PgUp/PgDn/Home/End then compute from an
  // old offset and jump wrong). Read the live value from the store instead.
  useInput((_input, key) => {
    const step = Math.max(1, Math.floor(logHeight / 2))
    const cur = store.getSnapshot().scroll
    if (key.pageUp) {
      store.set({ scroll: Math.min(maxScroll, cur + step) })
    } else if (key.pageDown) {
      store.set({ scroll: Math.max(0, cur - step) })
    } else if (state.edit.buf.length === 0 && (key.home || key.end)) {
      // Both the bare and the Ctrl-modified forms land here (Ink sets
      // key.end / key.home for either), so Ctrl+End / Ctrl+Home are a
      // reliable fallback on terminals that swallow the bare keys.
      store.set({ scroll: key.home ? maxScroll : 0 })
    }
  })

  // Scroll the log with the MOUSE WHEEL. Ink does not parse mouse events, so
  // useMouseWheel reads the raw SGR sequences (see the hook). One wheel notch
  // scrolls ~3 rows, like most terminals.
  useMouseWheel((delta) => {
    const cur = store.getSnapshot().scroll
    const next = cur + delta * 3
    store.set({ scroll: Math.max(0, Math.min(maxScroll, next)) })
  }, state.mouseScroll)

  return (
    <Box flexDirection="column" height={termRows}>
      <Header store={store} />
      {/* `flexGrow` instead of a fixed `height`: the pane takes whatever the
          panel leaves, so the layout can never be taller than the terminal.
          A fixed height that was even one row too big pushed the input rows
          off a short screen and the caret (positioned by absolute row) drifted
          UNDER the box while a long multi-line buffer was typed. */}
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minHeight={1}
        overflow="hidden"
        justifyContent="flex-end"
      >
        {all.length === 0 ? (
          <Text color={UI.dim}>
            {translate(state.locale)('editor.empty_hint')}
          </Text>
        ) : (
          <LogList entries={visible} />
        )}
      </Box>
      <StatusBar state={state} divider={false} />
      <InputLine
        {...inputProps}
        store={store}
        // Cursor rows above the input box: header + log viewport + status.
        // The log pane is FLEXIBLE now, so the panel below it starts right
        // after everything above: header + as many log rows as fit + the
        // suggestion popup + status. `cursorTop` counts the rows ABOVE the
        // input rows; the box border row is added by InputLine.
        cursorTop={fsLayout.cursorTop}
        prompt={state.prompt}
        locale={state.locale}
        commands={state.commands}
        locked={state.locked}
      />
      {/* A dim, single-line key hint UNDER the box. It is part of the fixed
          panel (see HINT_ROWS above), so it shrinks the log by one row and
          never shifts the caret. Truncated so it cannot wrap. The hint names
          the ACTIVE mouse mode, so the operator can tell why selection needs
          Shift (wheel scroll on) or why the wheel is inert (it is off). */}
      <Text color={UI.dim} wrap="truncate">
        {' ' +
          translate(state.locale)(
            state.mouseScroll ? 'editor.keys_hint' : 'editor.keys_hint_select',
          )}
      </Text>
    </Box>
  )
}
