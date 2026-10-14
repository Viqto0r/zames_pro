// Mount the REAL TuiEditor (the adapter index.ts uses), so the pty resize test
// exercises TuiEditor.installResizeHandler (unmount+remount), NOT just Ink's
// built-in erase. The raw FullScreenApp probe bypasses that handler.

import { TuiEditor } from '../src/tui/TuiEditor.js'

const ed = new TuiEditor({
  prompt: '\u2794 zames_pro \u203a ',
  commands: [
    { name: '/help', description: 'show help' },
    { name: '/new', description: 'new chat' },
  ],
  locale: 'en',
  alternateScreen: true,
})
ed.setHeader?.({
  title: 'zames_pro',
  version: '2.74.0',
  workdir: '/workspaces/zames/zames_pro',
})
ed.start()
ed.printAbove('log line one')
ed.printAbove('log line two')
setInterval(() => {}, 1 << 30)
