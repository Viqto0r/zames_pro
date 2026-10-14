// Mount the REAL TuiEditor and log every onSubmit (the EXPANDED text), so a pty
// can paste a LONG multi-line block and prove the agent receives all of it —
// not the [Pasted lines#N] marker.
import fs from 'node:fs'
import { TuiEditor } from '../src/tui/TuiEditor.js'
const LOG = process.env.PROBE_PASTE_LOG || '/tmp/longpaste.log'
fs.writeFileSync(LOG, '')
const ed = new TuiEditor({
  prompt: '> ',
  commands: [],
  locale: 'en',
  alternateScreen: true,
})
ed.onSubmit = (text: string) => {
  fs.appendFileSync(
    LOG,
    'SUBMIT_LEN=' +
      text.length +
      ' LINES=' +
      text.split(String.fromCharCode(10)).length +
      String.fromCharCode(10),
  )
  fs.appendFileSync(
    LOG,
    'HEAD=' + JSON.stringify(text.slice(0, 40)) + String.fromCharCode(10),
  )
  fs.appendFileSync(
    LOG,
    'TAIL=' + JSON.stringify(text.slice(-40)) + String.fromCharCode(10),
  )
}
ed.onAttach = () => null
ed.onClipboard = () => Promise.resolve(null)
ed.start()
setInterval(() => {}, 1 << 30)
