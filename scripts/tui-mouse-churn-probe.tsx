// Mount the REAL TuiEditor and tick the store every 150ms (like the 1s badge
// timer does), so the raw stdout can be scanned for how many times the
// mouse-mode sequences are written. A well-behaved hook writes them ONCE on
// mount; a hook whose effect depends on an inline `onWheel` re-runs on every
// render and writes `1007h` (alternate-scroll ON => wheel becomes history)
// again and again.

import { TuiEditor } from '../src/tui/TuiEditor.js'

const ed = new TuiEditor({
  prompt: '> ',
  commands: [],
  locale: 'en',
  alternateScreen: true,
})
ed.onSubmit = () => {}
ed.onAttach = () => null
ed.onClipboard = () => Promise.resolve(null)
ed.start()

let n = 0
const timer = setInterval(() => {
  // A no-op-ish store change: bump the queue badge, like refreshBadges does.
  ed.store.set({ queueLength: n++ })
  if (n > 20) clearInterval(timer)
}, 150)

setInterval(() => {}, 1 << 30)
