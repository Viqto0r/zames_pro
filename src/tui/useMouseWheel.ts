// A hook that reads the terminal's MOUSE-WHEEL events and scrolls the log.
//
// Ink 8 does NOT parse mouse events (its `useInput` only handles keys), and it
// STRIPS unknown CSI sequences, so the wheel never reaches a component. To
// scroll the chat with the wheel we therefore:
//   1. enable SGR mouse reporting on the terminal (ESC[?1000h ESC[?1006h);
//   2. listen to the RAW stdin bytes ourselves (Ink's own listener ignores
//      them, so there is no conflict).
//
// The SGR encoding is `BSC [ < Cb ; Cx ; Cy M` where Cb 64 = wheel up and
// 65 = wheel down (plus modifier bits). We only need Cb.
//
// ALTERNATE-SCROLL: while the app is in the ALTERNATE SCREEN (full-screen
// mode), terminals turn the mouse wheel into ARROW KEYS by default (DECSET
// 1007, "alternate scroll mode"). Ink parses those arrows as normal Up/Down,
// and the input editor at a buffer edge maps them to HISTORY -- so the wheel
// scrolled the INPUT HISTORY instead of the log (the operator's bug).
//
// Two clear, MUTUALLY EXCLUSIVE modes (a terminal cannot do both at once):
//   - SELECT (default, ui.mouseScroll=false): mouse reporting OFF. The
//     terminal owns the mouse, so drag-select works natively and the wheel is
//     inert (no arrows, no history jump). This is the default because
//     selection is a baseline expectation in a Terminal UI.
//   - SCROLL (ui.mouseScroll=true): mouse reporting ON, so the wheel arrives as
//     SCR events and scrolls the log; drag-select then needs SHIFT (the
//     standard Tui convention). Only one of the two can be active, and the
//     code enforces that with a SINGLE effect that both sets the sequence
//     and binds the listener -- no "half-enabled" state where reporting is
//     on but the wheel does nothing.
//
// ORDER MATTERS: some terminals only apply `1007l` while mouse reporting is
// enabled, so we enable 1000/1006 FIRST, then disable 1007. In SELECT mode we
// actually want reporting off, so we send the on/off pair ONCE at mount
// (the 1007l then "sticks") and then leave reporting off.

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
 * The terminal-mode sequences the hook writes for a given mode. Exported PURE
 * so a test can pin the exact bytes AND their order:
 *   - SELECT (enabled=false): NO `1000h/1006h` in the STEADY state, `om`
 *     only applies `1007l` (the one-time prime), and `off` guarantees the
 *     reporting bits are clear on unmount;
 *   - SCROLL (enabled=true): `1000h 1006h 1007l` in the STEADY state.
 */
export function mouseModeSequences(enabled: boolean): {
  /** Written on mount. */
  on: string
  /** Written on unmount (and as the SELECT primer). */
  off: string
} {
  // 1000 = button-event tracking, 1006 = SGR extended coords, 1007 off always
  // (being in alt-screen otherwise turns the wheel into arrows => history).
  const reportingOn = ESC + '[?1000h' + ESC + '[?1006h'
  const reportingOff = ESC + '[?1006l' + ESC + '[?1000l'
  const alternateScrollOff = ESC + '[?1007l'
  const alternateScrollOn = ESC + '[?1007h'
  if (enabled) {
    return {
      on: reportingOn + alternateScrollOff,
      off: reportingOff + alternateScrollOn,
    }
  }
  // SELECT: the on/off pair is applied ONCE at mount so the 1007l sticks even
  // though reporting is then off (some terminals ignore 1007l while reporting
  // is off). After the prime the steady state has reporting OFF, and the
  // listener is not bound, so nothing consumes the native selection.
  return {
    on: reportingOn + alternateScrollOff + reportingOff,
    off: reportingOff + alternateScrollOn,
  }
}

/**
 * Subscribe to wheel events on the given terminal and call `onWheel(delta)`
 * where delta > 0 means "scroll up / back".
 *
 * Two mutually exclusive modes (a terminal cannot have native
 * selection AND app-consumed wheel at the same time):
 *   - `enabled=false` (SELECT): mouse reporting stays OFF, native drag-select
 *     works, the wheel is inert. The listener is still bound so an accidental
 *     SGR byte from a previous mode never leaks into the editor as an arrow.
 *   - `enabled=true` (SCROLL): reporting is on, the wheel scrolls the log
 *     (via `onWheel`), drag-select needs Shift.
 */
export function useMouseWheel(
  onWheel: (delta: number) => void,
  enabled = false,
): void {
  const { stdin, isRawModeSupported } = useStdin()
  useEffect(() => {
    if (!isRawModeSupported) return
    const seq = mouseModeSequences(enabled)
    process.stdout.write(seq.on)
    // A sequence may be split across two chunks; carry the incomplete tail.
    let carry = ''
    const onData = (data: Buffer | string): void => {
      const s = typeof data === 'string' ? data : data.toString('utf-8')
      const buf = carry + s
      carry = incompleteTail(buf)
      const scan = carry ? buf.slice(0, buf.length - carry.length) : buf
      if (!scan.includes('\u001b[<')) return
      // SELECT mode ignores the wheel entirely (the event never reaches the
      // editor either -- there is no reporting to generate it in the first
      // place, but a stale SGR byte from a previous mode is swallowed here).
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
