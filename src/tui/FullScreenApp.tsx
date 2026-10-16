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
import { contentWidth } from '../width.js'
import { translate } from '../i18n.js'
import { suggestRowCount } from '../input/suggest.js'
import { inputBoxRows, truncateToWidth, visLen } from '../input/layout.js'
import { useMouseWheel } from './useMouseWheel.js'

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
        <Text color="#c8b06a" bold>
          {left}
        </Text>
        <Text color="#7fc4f0">{finalDir}</Text>
        <Text>
          {' '.repeat(
            Math.max(
              1,
              cols - visLen(left) - visLen(finalDir) - visLen(right) - 2,
            ),
          )}
        </Text>
        {right ? <Text color="#6fd0b0">{right}</Text> : null}
      </Box>
      <Text color="#3a3f4b">{'─'.repeat(cols)}</Text>
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

  // Fixed panel height: header (2) + status (1) + the input box (2 borders +
  // its VISUAL rows) + the suggestion popup rows. The log viewport gets the
  // rest.
  const HEADER_ROWS = 2
  const STATUS_ROWS = 1
  const cols = Math.max(1, useWindowSize().columns || 80)
  // The box height comes from the SAME layoutInput() the box renders with, so
  // the reserved rows and the drawn rows can never disagree (a logical-line
  // count missed the word-wrap of a long line and the second line overprinted
  // the first).
  const INPUT_BOX_ROWS = inputBoxRows(
    state.prompt,
    state.edit.buf,
    state.edit.cursor,
    cols,
  )
  // The suggestion popup renders ABOVE the input box; reserve its rows so
  // opening the list does not push the panel / shift the whole layout.
  const suggestRows = suggestRowCount(state.edit.buf, state.commands, cols)
  // A one-line hint UNDER the input box (selection / scroll keys). It is part
  // of the fixed panel height, so the log viewport shrinks by one row instead
  // of the panel overflowing; `cursorTop` (measured from the top) is NOT
  // affected, so the caret cannot move.
  const HINT_ROWS = 1
  const panelRows =
    HEADER_ROWS + STATUS_ROWS + INPUT_BOX_ROWS + suggestRows + HINT_ROWS
  const logHeight = Math.max(1, termRows - panelRows)

  // Window the log BY RENDERED ROW: a long wrapped answer can be taller than
  // one entry, and an entry-count window either overflowed the panel or left
  // it half empty. `scroll` is measured in ROWS here (0 = newest at the
  // bottom).
  const all = state.log
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
      <Box
        flexDirection="column"
        height={logHeight}
        overflow="hidden"
        justifyContent="flex-end"
      >
        {all.length === 0 ? (
          <Text color="#5b616e">
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
        cursorTop={HEADER_ROWS + logHeight + suggestRows + STATUS_ROWS + 1}
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
      <Text color="#5b616e" wrap="truncate">
        {' ' +
          translate(state.locale)(
            state.mouseScroll ? 'editor.keys_hint' : 'editor.keys_hint_select',
          )}
      </Text>
    </Box>
  )
}

void contentWidth
