// Mount the REAL TuiEditor and log the editor BUFFER after every change, so a
// pty driver can send keys and assert what the buffer became (word deletion,
// newlines, history) instead of guessing from bytes. The log is one JSON line
// per change: {buf, cursor}.

import fs from 'node:fs'
import { TuiEditor } from '../src/tui/TuiEditor.js'

const LOG = process.env.PROBE_EDIT_LOG || '/tmp/edit-probe.log'
const SEED = process.env.PROBE_EDIT_SEED || ''
fs.writeFileSync(LOG, '')

const ed = new TuiEditor({
  prompt: '> ',
  commands: [],
  locale: 'en',
  alternateScreen: process.env.PROBE_INLINE !== '1',
})
ed.onSubmit = () => {}
ed.onAttach = () => null
ed.onClipboard = () => Promise.resolve(null)

ed.store.subscribe(() => {
  const s = ed.store.getSnapshot().edit
  fs.appendFileSync(
    LOG,
    JSON.stringify({ buf: s.buf, cursor: s.cursor }) + String.fromCharCode(10),
  )
})

ed.start()
if (SEED) {
  // Type the seed through the store so the buffer starts non-empty.
  ed.store.update((snap) => ({
    edit: { ...snap.edit, buf: SEED, cursor: Array.from(SEED).length },
  }))
}
setInterval(() => {}, 1 << 30)
