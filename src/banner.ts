// The startup banner — a rounded box shown once at launch with the app name,
// version, working directory and active provider. Pure string building (no
// terminal access), so it is unit-testable and usable by both the TUI and the
// non-TTY path.

import { theme } from './theme.js'
import { visLen } from './input/layout.js'

export interface BannerInfo {
  title: string
  version: string
  workdir: string
  provider: string
  /** Extra hint lines (e.g. "run /help"). */
  hint?: string
}

/** Visible width of a string (ANSI stripped, wide chars counted as 2). */
function width(s: string): number {
  return visLen(stripAnsi(s))
}

/**
 * Remove CSI AND OSC escapes. An OSC body (an OSC-8 hyperlink, a terminal
 * title) is NOT visible text: a CSI-only regex counted every URL character as
 * a column, so the banner box was drawn too wide and the config menu's erase
 * height disagreed with the real screen (duplicated rows).
 */
function stripAnsi(s: string): string {
  return String(s ?? '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\|$)/g, '')
}

/**
 * Draw a rounded box around the given content lines. The box width is the
 * widest line (clamped to `maxWidth`), padded by one space each side. Lines
 * longer than the inner width are truncated with an ellipsis.
 */
function box(lines: string[], maxWidth: number): string {
  // A caller may pass 0 ("auto") or a tiny width on a narrow terminal. With
  // `maxWidth - 4` going negative the inner width collapsed to the 10-column
  // floor while every content line was clipped to `inner - 2`, so the title,
  // version and directory were replaced by a bare `…` — the banner was drawn
  // but said nothing. Fall back to a width that still fits the real fields.
  const widest = Math.max(...lines.map(width)) + 2
  const base =
    Number.isFinite(maxWidth) && maxWidth >= 12 ? maxWidth : widest + 4
  const inner = Math.max(10, Math.min(base - 4, widest))
  const top = theme.prompt('╭' + '─'.repeat(inner) + '╮')
  const bottom = theme.prompt('╰' + '─'.repeat(inner) + '╯')
  const body = lines.map((l) => {
    const maxContent = Math.max(0, inner - 2)
    const clipped = clip(l, maxContent)
    const w = width(clipped)
    const pad = Math.max(0, inner - 1 - w)
    return (
      theme.prompt('│') + ' ' + clipped + ' '.repeat(pad) + theme.prompt('│')
    )
  })
  return [top, ...body, bottom].join('\n')
}

/** Truncate an (ANSI-carrying) string to `max` visible columns. */
export function clipToWidth(s: string, max: number): string {
  return clip(s, max)
}

function clip(s: string, max: number): string {
  if (width(s) <= max) return s
  // The content carries a couple of ANSI runs, so the tail is dropped by
  // VISIBLE width and escape sequences are copied whole — a plain slice would
  // cut an escape in half and leak its remainder as text.
  let out = ''
  let visible = 0
  let i = 0
  const esc = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][\s\S]*?(?:\x07|\x1b\\|$)/y
  while (i < s.length && visible < max - 1) {
    esc.lastIndex = i
    const m = esc.exec(s)
    if (m && m.index === i) {
      out += m[0]
      i += m[0].length
      continue
    }
    const cp = s.codePointAt(i) as number
    const ch = String.fromCodePoint(cp)
    visible += cp >= 0x1100 ? 2 : 1
    if (visible > max - 1) break
    out += ch
    i += ch.length
  }
  return out + '…'
}

/**
 * The full startup banner string. `contentWidth` is the target outer width
 * (the terminal width minus a safety column).
 */
export function renderStartupBanner(
  info: BannerInfo,
  contentWidth: number,
): string {
  const title =
    theme.assistant('  ' + info.title) + theme.dim('  v' + info.version)
  const dir = theme.system('  cwd: ') + theme.dir(info.workdir)
  const prov = theme.system('  provider: ') + theme.toggleOn(info.provider)
  const lines = [title, dir, prov]
  if (info.hint) lines.push(theme.dim('  ' + info.hint))
  return box(lines, contentWidth)
}
