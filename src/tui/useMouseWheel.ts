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
// scrolled the INPUT HISTORY instead of the log (the operator's bug).
//
// ORDER MATTERS and reporting is ALWAYS ON: some terminals only apply `1007l`
// while mouse reporting is enabled, so sending `1007l` alone (the previous
// behavior when ui.mouseScroll was off) was a no-op there and the wheel kept
// arriving as arrows. We now enable 1000/1006 unconditionally and disable 1007
// right after. Consequence: drag-select needs SHIFT (the standard TUI
// convention — Shift+drag bypasses the app), which is the trade-off for a
// working wheel. `enabled` only decides whether the wheel SCROLLS the log;
// the events are consumed either way so they never reach the editor.

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

const ESC = String.fromCharCode(27)

/**
 * The terminal-mode sequences the hook writes. Exported PURE so a test can pin
 * the exact bytes AND their order (reporting FIRST, then 1007 off — some
 * terminals ignore `1007l` when mouse reporting is off, which is what made the
 * wheel keep scrolling the input history).
 */
export function mouseModeSequences(): { on: string; off: string } {
  const on =
    // 1000 = button-event tracking, 1006 = SGR extended coords, 1007 = off.
    ESC + '[?1000h' + ESC + '[?1006h' + ESC + '[?1007l'
  const off = ESC + '[?1006l' + ESC + '[?1000l' + ESC + '[?1007h'
  return { on, off }
}

/**
 * Subscribe to wheel events on the given terminal and call `onWheel(delta)`
 * where delta > 0 means "scroll up / back". Enables SGR mouse reporting while
 * mounted and disables alternate-scroll so the wheel is never turned into
 * arrow keys.
 */
export function useMouseWheel(
  onWheel: (delta: number) => void,
  enabled = true,
): void {
  const { stdin, isRawModeSupported } = useStdin()
  useEffect(() => {
    if (!isRawModeSupported) return
    const seq = mouseModeSequences()
    process.stdout.write(seq.on)
    // A sequence may be split across two chunks; carry the incomplete tail.
    let carry = ''
    const onData = (data: Buffer | string): void => {
      const s = typeof data === 'string' ? data : data.toString('utf-8')
      const buf = carry + s
      carry = incompleteTail(buf)
      const scan = carry ? buf.slice(0, buf.length - carry.length) : buf
      if (!scan.includes('\u001b[<')) return
      // `enabled` decides whether the wheel SCROLLS; the event is consumed
      // either way, so it never falls through to the editor as an arrow.
      if (!enabled) return
      const delta = parseWheel(scan)
      if (delta !== 0) onWheel(delta)
    }
    stdin.on('data', onData)
    return () => {
      stdin.removeListener('data', onData)
      // Disable mouse reporting on unmount so normal selection works again.
      process.stdout.write(seq.off)
    }
  }, [stdin, isRawModeSupported, onWheel, enabled])
}
