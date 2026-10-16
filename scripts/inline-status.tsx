import React from 'react'
import { render } from 'ink'
import { TuiStore } from '../src/tui/store.js'
import { TuiApp } from '../src/tui/TuiApp.js'
import { initialEditState } from '../src/tui/edit.js'
const store = new TuiStore()
store.set({
  title: 'z',
  version: '1',
  workdir: '/tmp',
  prompt: '> ',
  locale: 'en',
  commands: [],
  edit: { ...initialEditState(), buf: 'abc' },
  statusText: 'STATUS HERE',
})
const p = {
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
render(React.createElement(TuiApp, { store, inputProps: p }), {
  exitOnCtrlC: false,
  patchConsole: false,
})
setInterval(() => {}, 1 << 30)
