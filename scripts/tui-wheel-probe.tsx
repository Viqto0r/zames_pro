// Mount the REAL TuiEditor with a NON-EMPTY input history and a long log, so a
// pty can send real SGR wheel events and the probe can log whether the INPUT
// BUFFER or the LOG scroll offset changed. This distinguishes the two failure
// modes the operator kept hitting: wheel must scroll the LOG (SCROLL mode) and
// must NEVER touch the input history.

import fs from 'node:fs'
import { TuiEditor } from '../src/tui/TuiEditor.js'

const LOG = process.env.PROBE_WHEEL_LOG || '/tmp/wheel-probe.log'
fs.writeFileSync(LOG, '')

const ed = new TuiEditor({
  prompt: '> ',
  commands: [],
  locale: 'en',
  alternateScreen: true,
})
ed.onSubmit = () => {}
ed.onAttach = () => null
ed.onClipboard = () => Promise.resolve(null)
// Mouse-wheel scroll of the log is opt-in (config.ui.mouseScroll). Set it from
// the env so the driver can exercise BOTH modes on a real pty.
ed.setHeader?.({ mouseScroll: process.env.PROBE_MOUSE_SCROLL === '1' })

// A non-empty history: a wheel-to-history bug would replace the empty buffer
// with one of these lines.
const snap = ed.store.getSnapshot()
ed.store.set({
  edit: { ...snap.edit, history: ['OLD_COMMAND_ONE', 'OLD_COMMAND_TWO'] },
  scroll: 0,
})
// A tall log so there is something to scroll.
for (let i = 0; i < 40; i++) ed.printAbove('log line ' + i)

const report = (): void => {
  const s = ed.store.getSnapshot()
  fs.appendFileSync(
    LOG,
    JSON.stringify({ buf: s.edit.buf, scroll: s.scroll }) +
      String.fromCharCode(10),
  )
}
ed.store.subscribe(report)
report()

ed.start()
setInterval(() => {}, 1 << 30)
