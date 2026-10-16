// Mount the REAL FullScreenApp with a LONG log and log every scroll change,
// so a pty can press PgUp/PgDn/Home/End and prove the viewport moves.
import React from 'react'
import fs from 'node:fs'
import { render } from 'ink'
import { TuiStore } from '../src/tui/store.js'
import { FullScreenApp } from '../src/tui/FullScreenApp.js'
import { initialEditState } from '../src/tui/edit.js'

const LOG = process.env.PROBE_SCROLL_LOG || '/tmp/scroll-probe.log'
fs.writeFileSync(LOG, '')
const store = new TuiStore()
store.set({
  title: 'probe',
  version: '0',
  workdir: '/tmp',
  prompt: '\u2794 probe \u203a ',
  locale: 'en',
  commands: [],
  edit: { ...initialEditState(), buf: '' },
})
for (let i = 0; i < 100; i++) store.pushLog('system', 'log line ' + i)
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
store.subscribe(() => {
  fs.appendFileSync(
    LOG,
    String(store.getSnapshot().scroll) + String.fromCharCode(10),
  )
})
render(React.createElement(FullScreenApp, { store, inputProps }), {
  exitOnCtrlC: false,
  patchConsole: false,
  alternateScreen: true,
})
setInterval(() => {}, 1 << 30)
