// A tiny Ink harness that mounts the REAL FullScreenApp with a scripted store,
// so a pty run can assert the on-screen geometry (input box height, cursor
// row) instead of grepping escape bytes. Run under `script -qec` and feed keys
// on stdin; the terminal output is replayed by the VT100 emulator in the test.
//
// NOT shipped: a dev probe only (lives in scripts/, not in `files`).

import React from 'react'
import { render } from 'ink'
import { TuiStore } from '../src/tui/store.js'
import { FullScreenApp } from '../src/tui/FullScreenApp.js'
import { initialEditState } from '../src/tui/edit.js'

const store = new TuiStore()
store.set({
  title: 'probe',
  version: '0.0.0',
  workdir: '/tmp',
  prompt: '> ',
  locale: 'en',
  commands: [],
  edit: { ...initialEditState(), buf: process.argv[2] ?? '' },
})

// A few log rows so the viewport is not empty.
store.pushLog('system', 'log line one')
store.pushLog('system', 'log line two')

render(
  <FullScreenApp
    store={store}
    inputProps={{
      onSubmit: () => {},
      onEscape: () => {},
      onCtrlC: () => {},
      onAttach: () => null,
      onClipboard: () => Promise.resolve(null),
      onHistoryChange: () => {},
      onClearScreen: () => {},
      attachments: [],
      onPastesChange: () => {},
    }}
  />,
  { exitOnCtrlC: false, patchConsole: false },
)

// Keep the app alive until killed.
setInterval(() => {}, 1 << 30)
