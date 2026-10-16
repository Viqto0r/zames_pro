// Minimal probe: mount the REAL FullScreenApp with a store whose submit
// callback logs what it receives. Used to verify the bracketed-paste ->
// [Pasted lines#N] -> expandPastes path end to end.

import React from 'react'
import fs from 'node:fs'
import { render } from 'ink'
import { TuiStore } from '../src/tui/store.js'
import { FullScreenApp } from '../src/tui/FullScreenApp.js'
import { initialEditState } from '../src/tui/edit.js'
import { expandPastes } from '../src/input/layout.js'

const LOG = process.env.PROBE_SUBMIT_LOG || '/tmp/paste-submit.log'
const store = new TuiStore()
store.set({
  title: 'probe',
  version: '0',
  workdir: '/tmp',
  prompt: '> ',
  locale: 'en',
  commands: [],
  edit: { ...initialEditState(), buf: '' },
})
const inputProps = {
  onSubmit: (text: string) => {
    // Mirrors TuiEditor.handleSubmit: expand the paste markers from the
    // CURRENT store snapshot, which is what the agent actually receives.
    const expanded = expandPastes(store.getSnapshot().pastes, text)
    fs.appendFileSync(
      LOG,
      'SUBMIT=' + JSON.stringify(expanded) + String.fromCharCode(10),
    )
  },
  onEscape: () => {},
  onCtrlC: () => {},
  onAttach: () => null,
  onClipboard: () => Promise.resolve(null),
  onHistoryChange: () => {},
  onClearScreen: () => {},
  attachments: [],
  onPastesChange: (p: unknown) => {
    // Mirrors TuiEditor.buildInputProps: the adapter writes the paste list
    // BACK into the store, which is what handleSubmit reads to expand markers.
    store.set({ pastes: p as never })
    fs.appendFileSync(
      LOG,
      'PASTES=' + JSON.stringify(p) + String.fromCharCode(10),
    )
  },
}
render(<FullScreenApp store={store} inputProps={inputProps} />, {
  exitOnCtrlC: false,
  patchConsole: false,
  alternateScreen: true,
})
setInterval(() => {}, 1 << 30)
