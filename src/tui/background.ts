// Terminal BACKGROUND handling.
//
// A terminal cannot be told to paint "the background" — only the cells an app
// writes are styled. So a theme's `bg` reaches the screen by
//   1. emitting an OSC-11 background colour for the whole window (most modern
//      terminals support it; a terminal that does not answers nothing), and
//   2. re-emitting it AFTER a full-screen app exits: the alternate screen keeps
//      the window's background, and Ink's exit sequence resets attributes
//      (SGR reset does not touch OSC-11, but some terminals do reset the colour
//      on 1049l). Re-emitting is harmless where unsupported.
//
// The OSC sequence is written STRAIGHT to stdout (not through chalk), because
// it is not an SGR attribute: `\x1b]11;rgb:rr/gg/bb\x07`.

import { ALL_PALETTES, isThemeName, DEFAULT_THEME } from '../theme.js'

/** `#rrggbb` -> the `rr/gg/bb` part of an OSC-11 payload. */
function hexToOsc(hex: string): string {
  const h = hex.replace('#', '')
  return `${h.slice(0, 2)}/${h.slice(2, 4)}/${h.slice(4, 6)}`
}

/**
 * The OSC-11 sequence that sets the window background, or '' when the operator
 * opted out (NO_COLOR / ZAMES_NO_BG). Exported pure, so the encoding is
 * testable without a terminal.
 */
export function backgroundOsc(name: unknown): string {
  if (process.env.NO_COLOR || process.env.ZAMES_NO_BG) return ''
  const id = isThemeName(name) ? name : DEFAULT_THEME
  return '\x1b]11;rgb:' + hexToOsc(ALL_PALETTES[id].bg) + '\x07'
}

/** Paint the window background for the palette `name` (best effort). */
export function applyBackground(name: unknown): void {
  const seq = backgroundOsc(name)
  if (!seq) return
  try {
    process.stdout.write(seq)
  } catch {
    // A closed/redirected stdout must not break a theme switch.
  }
}
