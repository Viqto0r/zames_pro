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
    // `enabled` gates terminal mouse REPORTING: while it is on, the terminal
    // sends mouse events to us (so the wheel can scroll the log) but DRAG
    // SELECTION stops working. Off by default (see config ui.mouseScroll).
    if (!enabled || !isRawModeSupported) return
    const ESC = String.fromCharCode(27)
    // Enable button-event tracking + SGR extended coordinates.
    process.stdout.write(ESC + '[?1000h' + ESC + '[?1006h')
    const onData = (data: Buffer | string): void => {
      const s = typeof data === 'string' ? data : data.toString('utf-8')
      if (!s.includes('\u001b[<')) return
      const delta = parseWheel(s)
      if (delta !== 0) onWheel(delta)
    }
    stdin.on('data', onData)
    return () => {
      stdin.removeListener('data', onData)
      // Disable mouse reporting on unmount so a copied selection works again.
      process.stdout.write(ESC + '[?1006l' + ESC + '[?1000l')
    }
  }, [stdin, isRawModeSupported, onWheel, enabled])
}
