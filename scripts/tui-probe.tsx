// A tiny Ink harness that mounts the REAL FullScreenApp with a scripted store,
// so a pty run can assert the on-screen geometry (input box height, cursor
// row) instead of grepping escape bytes. Run under `script -qec` and feed keys
// on stdin; the terminal output is replayed by the VT100 emulator in the test.
//
// NOT shipped: a dev probe only (lives in scripts/, not in `files`).

import React from 'react'
import fs from 'node:fs'
import { render } from 'ink'
import { TuiStore } from '../src/tui/store.js'
import { FullScreenApp } from '../src/tui/FullScreenApp.js'
import { TuiApp } from '../src/tui/TuiApp.js'
import { initialEditState } from '../src/tui/edit.js'

const store = new TuiStore()
store.set({
  title: 'probe',
  version: '0.0.0',
  workdir: '/tmp',
  prompt: '> ',
  locale: 'en',
  commands: [],
  mouseScroll: process.env.PROBE_MOUSE === '1',
  edit: { ...initialEditState(), buf: process.argv[2] ?? '' },
})

// A few log rows so the viewport is not empty.
store.pushLog('system', 'log line one')
store.pushLog('system', 'log line two')

const INLINE = process.env.PROBE_INLINE === '1'

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

render(
  INLINE ? (
    <TuiApp store={store} inputProps={inputProps} />
  ) : (
    <FullScreenApp store={store} inputProps={inputProps} />
  ),
  { exitOnCtrlC: false, patchConsole: false, alternateScreen: !INLINE },
)

// Keep the app alive until killed.
setInterval(() => {}, 1 << 30)
