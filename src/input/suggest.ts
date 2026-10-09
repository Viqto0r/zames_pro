// PURE slash-command suggestion logic — the match / paging / completion half
// of the LineEditor's «/» hint list (src/input.ts). No terminal access and no
// editor state: given the buffer text and the command list these decide which
// commands to show, the visible window, and the Tab completion. Split out
// (C3) so the fuzzy match can be unit-tested without driving the editor.

import { SUGGEST_PAGE, isSubsequence, type SlashCommand } from './layout.js'

/**
 * The commands matching the current buffer. Shown only when the line starts
 * with «/» and is a single short word. The match is fuzzy: an exact prefix
 * first, then a substring, then a subsequence (e.g. "hst" -> "/history"), so
 * a half-remembered command name still surfaces. Order is preserved.
 */
export function matchSlashCommands(
  buf: string,
  commands: SlashCommand[],
): SlashCommand[] {
  const b = buf
  if (!b.startsWith('/')) return []
  if (b.includes(String.fromCharCode(10)) || b.includes(' ')) return []
  if (b.length > 40) return []
  const q = b.toLowerCase()
  if (q === '/') return commands
  // Match on the part AFTER the leading slash: comparing the raw query (which
  // itself starts with '/') against the full name made the fuzzy subsequence
  // match fire on the slash alone (e.g. "/x" matched "/self-fix").
  const body = q.slice(1)
  const prefix: SlashCommand[] = []
  const substring: SlashCommand[] = []
  const fuzzy: SlashCommand[] = []
  // A single character only matches by PREFIX: a one-letter substring /
  // subsequence match is far too loose ("x" would pull in "/self-fix").
  const loose = body.length >= 2
  for (const c of commands) {
    const name = c.name.toLowerCase().slice(1)
    if (name.startsWith(body)) prefix.push(c)
    else if (loose && name.includes(body)) substring.push(c)
    else if (loose && isSubsequence(body, name)) fuzzy.push(c)
  }
  return prefix.concat(substring, fuzzy)
}

/**
 * The visible slice of the suggestion list for a given scroll offset. Returns
 * the shown commands, the CLAMPED offset and how many rows the block takes
 * (the page plus an optional "more" line). Pure — the caller renders the rows.
 */
export function suggestWindow(
  sugg: SlashCommand[],
  offset: number,
): { shown: SlashCommand[]; off: number; moreCount: number } {
  if (!sugg.length) return { shown: [], off: 0, moreCount: 0 }
  const pageSize = SUGGEST_PAGE
  const maxOffset = Math.max(0, sugg.length - pageSize)
  const off = Math.max(0, Math.min(offset, maxOffset))
  const shown = sugg.slice(off, off + pageSize)
  const moreCount = sugg.length > pageSize ? sugg.length - shown.length : 0
  return { shown, off, moreCount }
}

/**
 * Tab completion. With an explicit selection, insert that command. With a
 * single match, insert it whole. Otherwise complete up to the longest common
 * prefix of the matches. Returns the new buffer, or null when nothing should
 * change.
 */
export function completeSlashCommand(
  buf: string,
  sugg: SlashCommand[],
  selected: number,
): string | null {
  if (!sugg.length) return null
  if (selected >= 0 && selected < sugg.length) {
    return sugg[selected].name + ' '
  }
  if (sugg.length === 1) return sugg[0].name + ' '
  let prefix = sugg[0].name
  for (const c of sugg) {
    while (!c.name.toLowerCase().startsWith(prefix.toLowerCase())) {
      prefix = prefix.slice(0, -1)
    }
  }
  return prefix.length > buf.length ? prefix : null
}
