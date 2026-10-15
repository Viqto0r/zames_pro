// Minimal LIVE-like probe: the REAL TuiEditor exactly as index.ts builds it
// (default options), plus a raw-stdin TAP that logs every byte the terminal
// sends, so we can see EXACTLY what Ctrl+Delete produces on this terminal.
import fs from 'node:fs'
import { TuiEditor } from '../src/tui/TuiEditor.js'

const LOG = process.env.PROBE_CTD_LOG || '/tmp/ctd-live.log'
fs.writeFileSync(LOG, '')
const w = (s: string): void => {
  fs.appendFileSync(LOG, s + String.fromCharCode(10))
}

const ed = new TuiEditor({
  prompt: '❯ › ',
  commands: [],
  locale: 'ru',
  alternateScreen: true,
})
ed.onSubmit = () => {}
ed.onAttach = () => null
ed.onClipboard = () => Promise.resolve(null)
ed.start()

// Tap raw stdin: hex-dump every chunk so we see the exact bytes.
process.stdin.on('data', (d: Buffer) => {
  w('RAW ' + d.toString('hex') + ' ' + JSON.stringify(d.toString('utf-8')))
})
// Log the buffer after every change.
ed.store.subscribe(() => {
  const s = ed.store.getSnapshot().edit
  w('BUF ' + JSON.stringify(s.buf) + ' cur=' + s.cursor)
})
setInterval(() => {}, 1 << 30)
