// Mount the REAL FullScreenApp with a log driven by PROBE_LOG (JSON entries),
// so empty/overflowing/long-wrapped logs can be screenshotted.
import React from 'react'
import { render } from 'ink'
import { TuiStore } from '../src/tui/store.js'
import { FullScreenApp } from '../src/tui/FullScreenApp.js'
import { initialEditState } from '../src/tui/edit.js'

const store = new TuiStore()
store.set({
  title: 'zames',
  version: '2.74',
  workdir: '/tmp',
  prompt: '\u2794 zames \u203a ',
  locale: 'en',
  commands: [],
  edit: { ...initialEditState(), buf: '' },
})
const spec = process.env.PROBE_LOG || 'empty'
if (spec === 'empty') {
  // nothing
} else if (spec === 'few') {
  store.pushLog('user', 'hello')
  store.pushLog('assistant', 'hi there')
} else if (spec === 'many') {
  for (let i = 0; i < 100; i++) store.pushLog('system', 'log line ' + i)
} else if (spec === 'long') {
  store.pushLog('assistant', 'L'.repeat(300))
  store.pushLog('system', 'after long')
}
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
render(React.createElement(FullScreenApp, { store, inputProps }), {
  exitOnCtrlC: false,
  patchConsole: false,
  alternateScreen: true,
})
setInterval(() => {}, 1 << 30)
