// Mount the REAL StatusBar with all badges set, to check the width math at
// narrow terminals (truncation must not clip the badges).
import React from 'react'
import { render } from 'ink'
import { StatusBar } from '../src/tui/StatusBar.js'
import { TuiStore } from '../src/tui/store.js'
const store = new TuiStore()
store.set({
  locale: 'ru',
  busy: true,
  animBase: 'Думаю',
  animStart: Date.now() - 45000,
  provider: 'DeepSeek',
  queueLength: 2,
  tasks: 'задачи: 2/5',
  thinkingEnabled: true,
  searchEnabled: true,
  contextText: 'ctx: 302k · 30%',
  contextLevel: 'warn',
  statusLine: 'git:master',
  sendState: 'generating',
})
render(React.createElement(StatusBar, { state: store.getSnapshot() }), {
  exitOnCtrlC: false,
  patchConsole: false,
})
setInterval(() => {}, 1 << 30)
