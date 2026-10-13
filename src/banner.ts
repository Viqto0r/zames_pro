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
  return visLen(s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''))
}

/**
 * Draw a rounded box around the given content lines. The box width is the
 * widest line (clamped to `maxWidth`), padded by one space each side. Lines
 * longer than the inner width are truncated with an ellipsis.
 */
function box(lines: string[], maxWidth: number, border = '#c8b06a'): string {
  const inner = Math.max(
    10,
    Math.min(maxWidth - 4, Math.max(...lines.map(width)) + 2),
  )
  const top = theme.prompt('╭' + '─'.repeat(inner) + '╮')
  const bottom = theme.prompt('╰' + '─'.repeat(inner) + '╯')
  const body = lines.map((l) => {
    // Truncate to the inner width so a long path never breaks the frame.
    const maxContent = Math.max(0, inner - 2)
    const clipped = clip(l, maxContent)
    const w = width(clipped)
    const pad = Math.max(0, inner - 1 - w)
    return (
      theme.prompt('│') + ' ' + clipped + ' '.repeat(pad) + theme.prompt('│')
    )
  })
  void border
  return [top, ...body, bottom].join('\n')
}

/** Truncate an (ANSI-carrying) string to `max` visible columns. */
function clip(s: string, max: number): string {
  if (width(s) <= max) return s
  // The banner content has at most a couple of ANSI runs; drop the tail by
  // visible width while keeping escape sequences intact.
  let out = ''
  let visible = 0
  let i = 0
  const esc = /\x1b\[[0-9;?]*[A-Za-z]/y
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
