// Reproduce the LIVE TUI scenario for the input-box geometry bug.
//
// The stock probe uses a bare `> ` prompt, an empty command list and no header, which is why the gated pty test stays green while the live agent still overprints the second input line. This probe mounts the same FullScreenApp with a realistic prompt, a non-empty slash command list and a long title.
//
// NOT shipped: a dev probe only.

import React from 'react'
import { render } from 'ink'
import { TuiStore } from '../src/tui/store.js'
import { FullScreenApp } from '../src/tui/FullScreenApp.js'
import { TuiApp } from '../src/tui/TuiApp.js'
import { initialEditState } from '../src/tui/edit.js'

const store = new TuiStore()
const commands = [
  { name: '/help', description: 'show help' },
  { name: '/history', description: 'input history' },
  { name: '/new', description: 'new chat' },
  { name: '/resume', description: 'open a chat' },
  { name: '/config', description: 'settings' },
  {
    name: '/self-review',
    description:
      'snapshot src/ and review the current working tree for bugs and risks',
  },
]
store.set({
  title: 'zames_pro',
  version: '2.34.0',
  workdir: '/workspaces/zames/zames_pro',
  prompt: '❯ › ',
  locale: process.env.PROBE_LOCALE === 'ru' ? 'ru' : 'en',
  commands,
  // Mirror the ACTIVE mouse mode so the hint row (and the mouse reporting the
  // app turns on) matches the live default. The pty test sets PROBE_MOUSE=1.
  mouseScroll: process.env.PROBE_MOUSE === '1',
  edit: { ...initialEditState(), buf: process.argv[2] ?? '' },
})

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

setInterval(() => {}, 1 << 30)
