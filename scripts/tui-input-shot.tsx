// Mount the REAL FullScreenApp with a buffer set from env, so the input box
// rendering (wrapping, cursor, CJK width, paste markers) can be screenshotted.
import React from 'react'
import { render } from 'ink'
import { TuiStore } from '../src/tui/store.js'
import { FullScreenApp } from '../src/tui/FullScreenApp.js'
import { initialEditState } from '../src/tui/edit.js'
import { layoutInput, inputInnerCols } from '../src/input/layout.js'

const buf = process.env.PROBE_BUF || ''
const cursor = process.env.PROBE_CURSOR
  ? Number(process.env.PROBE_CURSOR)
  : buf.length
const store = new TuiStore()
store.set({
  title: 'zames',
  version: '2.74',
  workdir: '/workspaces/zames/zames_pro',
  prompt: '\u2794 zames \u203a ',
  locale: 'en',
  commands: [],
  edit: { ...initialEditState(), buf, cursor },
})
store.pushLog('system', 'log line one')
const inputProps = {
  onSubmit: () => {},
  onEscape: () => {},
  onCtrlC: () => {},
  onAttach: () => null,
  onClipboard: () => Promise.resolve(null),
  onHistoryChange: () => {},
  onClearScreen: () => {},
  attachments: [],
  onPastesChange: () => {},
}
// Print the expected layout to stderr so it can be compared with the screen.
const cols = Number(process.env.COLUMNS || 80)
const lay = layoutInput(
  '\u2794 zames \u203a ',
  buf,
  cursor,
  inputInnerCols(cols),
)
process.stderr.write(
  'LAYOUT rows=' +
    lay.rows.length +
    ' cursorRow=' +
    lay.cursorRow +
    ' cursorCol=' +
    lay.cursorCol +
    String.fromCharCode(10),
)
render(React.createElement(FullScreenApp, { store, inputProps }), {
  exitOnCtrlC: false,
  patchConsole: false,
  alternateScreen: true,
})
setInterval(() => {}, 1 << 30)
