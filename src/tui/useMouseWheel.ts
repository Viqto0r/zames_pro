// A hook that reads the terminal's MOUSE-WHEEL events and scrolls the log.
//
// Ink 8 does NOT parse mouse events (its `useInput` only handles keys), and it
// STRIPS unknown CSI sequences, so the wheel never reaches a component. To
// scroll the chat with the wheel we therefore:
//   1. enable SGR mouse reporting on the terminal (ESC[?1000h ESC[?1006h);
//   2. listen to the RAW stdin bytes ourselves (Ink's own listener ignores
//      them, so there is no conflict).
//
// The SGR encoding is `ESC [ < Cb ; Cx ; Cy M` where Cb 64 = wheel up and
// 65 = wheel down (plus modifier bits). We only need Cb.
//
// ALTERNATE-SCROLL: while the app is in the ALTERNATE SCREEN (full-screen
// mode), terminals turn the mouse wheel into ARROW KEYS by default (DECSET
// 1007, "alternate scroll mode"). Ink parses those arrows as normal Up/Down,
// and the input editor at a buffer edge maps them to HISTORY — so the wheel
// "scrolled the input history" instead of the log, even with mouseScroll off.
// We therefore DISABLE 1007 for the whole app lifetime (on and off), so the
// wheel never becomes arrow keys. With mouseScroll ON the raw SGR events still
// arrive (1000/1006 are enabled) and scroll the log; with it OFF the wheel is
// simply inert and drag-select keeps working.

import { useEffect } from 'react'
import { useStdin } from 'ink'

/** True when a chunk contains an SGR mouse wheel event; returns the delta. */
export function parseWheel(chunk: string): number {
  // Count wheel-ups (down) and wheel-downs (up) in the chunk.
  let delta = 0
  const re = /\x1b\[<(\d+);\d+;\d+[Mm]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(chunk)) !== null) {
    const cb = Number(m[1])
    // Button code 64 = wheel up (scroll back), 65 = wheel down (scroll fwd).
    const button = cb & 0b11000011
    if (button === 64) delta += 1
    else if (button === 65) delta -= 1
  }
  return delta
}

/**
 * The part of an SGR mouse sequence at the END of `chunk` that is still
 * INCOMPLETE (no `M`/`m` terminator yet), or '' when the chunk ends cleanly.
 * A terminal may split one sequence across two `data` events; scanning each
 * chunk alone dropped the wheel notch (the hook keeps this tail and prepends
 * it to the next chunk).
 */
export function incompleteTail(chunk: string): string {
  const start = chunk.lastIndexOf('\u001b[<')
  if (start === -1) return ''
  // Complete if an `M`/`m` follows the introducer before the chunk ends.
  if (/[Mm]/.test(chunk.slice(start + 3))) return ''
  return chunk.slice(start)
}

/**
 * Subscribe to wheel events on the given terminal and call `onWheel(delta)`
 * where delta > 0 means "scroll up / back". Enables SGR mouse reporting while
 * mounted and disables it on unmount.
 */
export function useMouseWheel(
  onWheel: (delta: number) => void,
  enabled = true,
): void {
  const { stdin, isRawModeSupported } = useStdin()
  useEffect(() => {
    if (!isRawModeSupported) return
    const ESC = String.fromCharCode(27)
    // ALWAYS disable alternate-scroll (DECSET 1007) so the terminal does not
    // turn the mouse wheel into arrow keys (see the file header). This is what
    // stopped the wheel from scrolling the INPUT HISTORY with mouseScroll off.
    process.stdout.write(ESC + '[?1007l')
    // `enabled` gates terminal mouse REPORTING: while it is on, the terminal
    // sends mouse events to us (so the wheel can scroll the log) but DRAG
    // SELECTION stops working. Off by default (see config ui.mouseScroll).
    if (!enabled) {
      return () => {
        // Re-arm the terminal default we touched, so a shell after exit behaves
        // as before (terminals usually default 1007 on in the alt screen).
        process.stdout.write(ESC + '[?1007h')
      }
    }
    // Enable button-event tracking + SGR extended coordinates.
    process.stdout.write(ESC + '[?1000h' + ESC + '[?1006h')
    // A sequence may be split across two chunks; carry the incomplete tail.
    let carry = ''
    const onData = (data: Buffer | string): void => {
      const s = (typeof data === 'string' ? data : data.toString('utf-8'))
      const buf = carry + s
      carry = incompleteTail(buf)
      const scan = carry ? buf.slice(0, buf.length - carry.length) : buf
      if (!scan.includes('\u001b[<')) return
      const delta = parseWheel(scan)
      if (delta !== 0) onWheel(delta)
    }
    stdin.on('data', onData)
    return () => {
      stdin.removeListener('data', onData)
      // Disable mouse reporting on unmount so a copied selection works again.
      process.stdout.write(ESC + '[?1006l' + ESC + '[?1000l')
      process.stdout.write(ESC + '[?1007h')
    }
  }, [stdin, isRawModeSupported, onWheel, enabled])
}
