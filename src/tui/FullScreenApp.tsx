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
import { StatusBar } from './StatusBar.js'
import { InputLine, type InputLineProps } from './InputLine.js'
import type { TuiStore } from './store.js'
import { contentWidth } from '../width.js'
import { translate } from '../i18n.js'
import { suggestRowCount } from '../input/suggest.js'
import { inputBoxRows } from '../input/layout.js'
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
  const dir = state.workdir ? '  ' + state.workdir : ''
  const gap = Math.max(1, cols - left.length - dir.length - right.length - 2)
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="#c8b06a" bold>
          {left}
        </Text>
        <Text color="#7fc4f0">{dir}</Text>
        <Text>{' '.repeat(gap)}</Text>
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
  const suggestRows = suggestRowCount(state.edit.buf, state.commands)
  const panelRows = HEADER_ROWS + STATUS_ROWS + INPUT_BOX_ROWS + suggestRows
  const logHeight = Math.max(1, termRows - panelRows)

  // Window the log: show the last `logHeight` entries shifted by `scroll`
  // (0 = newest at the bottom). Each entry is roughly one row, which is a
  // close enough window; a tall wrapped answer just shows a bit less.
  const all = state.log
  const maxScroll = Math.max(0, all.length - logHeight)
  const scroll = Math.max(0, Math.min(state.scroll, maxScroll))
  const end = all.length - scroll
  const start = Math.max(0, end - logHeight)
  const visible = all.slice(start, end)

  // Scroll the log with PgUp/PgDn.
  useInput((_input, key) => {
    const step = Math.max(1, Math.floor(logHeight / 2))
    if (key.pageUp) {
      store.set({ scroll: Math.min(maxScroll, scroll + step) })
    } else if (key.pageDown) {
      store.set({ scroll: Math.max(0, scroll - step) })
    }
  })

  // Scroll the log with the MOUSE WHEEL. Ink does not parse mouse events, so
  // useMouseWheel reads the raw SGR sequences (see the hook). One wheel notch
  // scrolls ~3 rows, like most terminals.
  useMouseWheel((delta) => {
    const next = scroll + delta * 3
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
    </Box>
  )
}

void contentWidth
