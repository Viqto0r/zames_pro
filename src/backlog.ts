import { parseBacklogItems } from './commands.js'

// BACKLOG.md maintenance — the pure half of /backlog and the automatic pruning
// that runs after /improve. BACKLOG.md is the agent's own improvement-notes
// file (gitignored); it is READ by /improve, so keeping it small matters —
// every finished item used to keep a full copy of its original text inside a
// <details> block, and the file grew without bound.
//
// Everything here is pure and unit-tested; index.ts only reads/writes the file.

const NL = String.fromCharCode(10)

// Agent-appended items use this id prefix. A distinct letter keeps them apart
// from the hand-numbered A/B/C/D/E entries, so it is obvious which notes the
// agent added on its own.
const NEW_ITEM_PREFIX = 'N'

// Past these thresholds BACKLOG.md costs more tokens (on /improve) than it is
// worth, so the operator is nudged to collapse it.
export const BACKLOG_WARN_LINES = 500
export const BACKLOG_WARN_CHARS = 60_000

// Parse a `/backlog <text>` note into the shape appendBacklogItem() wants. An
// optional leading `P0..P3` token sets the priority; the first line becomes the
// title and the rest the body. PURE so the operator's note is placed exactly as
// shown — no model round-trip, no chance of a different id than the one printed.
export function parseBacklogNote(note: string): {
  priority: string
  title: string
  note?: string
} {
  const raw = String(note ?? '')
  let priority = 'P2'
  let body = raw
  for (const p of ['P0', 'P1', 'P2', 'P3']) {
    if (raw.toUpperCase().startsWith(p + ' ')) {
      priority = p
      body = raw.slice(p.length + 1)
      break
    }
  }
  const bodyLines = body.split(NL)
  const title = bodyLines[0]
  const rest = bodyLines.slice(1).join(NL).trim()
  return { priority, title, note: rest || undefined }
}

function squashBlankLines(lines: string[]): string[] {
  const out: string[] = []
  let blanks = 0
  for (const line of lines) {
    if (line.trim() === '') {
      blanks++
      if (blanks > 2) continue
    } else {
      blanks = 0
    }
    out.push(line)
  }
  return out
}

// A real, kept heading: a `## P<n>` section or a `### X<n>.` item heading that
// is NOT the archived copy (archived copies carry `~~` right after the id).
function isRealBoundary(line: string): boolean {
  const t = line.trim()
  if (/^##\s/.test(t)) return true
  return /^###\s+[A-Z]\d+[.]/.test(t) && !/^###\s+[A-Z]\d+[.]\s+~~/.test(t)
}

function isDetailsOpen(line: string): boolean {
  return line.trim().startsWith('<details')
}

function isArchivedHeading(line: string): boolean {
  return /^###\s+[A-Z]\d+[.]\s+~~/.test(line.trim())
}

/**
 * Remove archived copies of finished items. A finished item keeps its
 * `### X. [x] ... done` summary line; the `### X. ~~original~~` copy and its
 * body (normally wrapped in a <details> block) are dropped.
 *
 * Deliberately tolerant of an UNCLOSED <details>: a real backlog item was
 * written as `### A1. [x] ...` then `<details>...` with no `</details>`, so the
 * whole file became one nested block. Keying the end of a block on the next
 * REAL heading (a `### X.` without `~~`, or a `## ` section) — not only on
 * `</details>` — keeps the summary lines and the open items even then. Pure and
 * unit-tested; a heading that looks like an item INSIDE an archive is skipped
 * because it carries `~~`.
 */
export function collapseBacklog(text: string): {
  text: string
  changed: boolean
  collapsed: number
} {
  const src = String(text ?? '')
  const lines = src.split(NL)
  const out: string[] = []
  let collapsed = 0
  let i = 0
  while (i < lines.length) {
    if (isDetailsOpen(lines[i]) || isArchivedHeading(lines[i])) {
      // Skip to the end of the archive: the first `</details>` OR the first
      // real heading, whichever comes first (see the note above).
      let j = i + 1
      while (j < lines.length) {
        const t = lines[j].trim()
        if (t.startsWith('</details>')) {
          j++
          break
        }
        if (isRealBoundary(t)) break
        j++
      }
      collapsed++
      i = j
      continue
    }
    out.push(lines[i])
    i++
  }
  const next = squashBlankLines(out).join(NL)
  return { text: next, changed: next !== src, collapsed }
}

export interface BacklogStats {
  lines: number
  chars: number
  open: number
  done: number
  /** <details> archive blocks still present. */
  archived: number
}

export function backlogStats(text: string): BacklogStats {
  const src = String(text ?? '')
  const items = parseBacklogItems(src)
  let archived = 0
  for (const line of src.split(NL)) {
    if (line.trim().startsWith('<details')) archived++
  }
  return {
    lines: src.split(NL).length,
    chars: src.length,
    open: items.filter((i) => i.status === 'open').length,
    done: items.filter((i) => i.status === 'done').length,
    archived,
  }
}

/** True when the file is big enough to deserve a collapse nudge. */
export function backlogNeedsPruning(stats: BacklogStats): boolean {
  return stats.lines > BACKLOG_WARN_LINES || stats.chars > BACKLOG_WARN_CHARS
}

/** The next free N<n> id not yet used in the file. */
export function nextBacklogId(text: string): string {
  let max = 0
  const re = /^###[ ]+([A-Z])([0-9]+)[.]/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(String(text ?? '')))) {
    if (m[1] === NEW_ITEM_PREFIX) max = Math.max(max, Number(m[2]))
  }
  return NEW_ITEM_PREFIX + (max + 1)
}

export interface NewBacklogItem {
  /** One-line summary (the heading text after the id). */
  title: string
  /** P0..P3; anything else falls back to P2. */
  priority?: string
  /** Optional body: why it matters and a fix sketch. */
  note?: string
}

/**
 * Insert a new OPEN item under the matching `## P<n>` section (or append a new
 * section at the end). Returns the new file text and the generated id. Pure;
 * the caller writes the file.
 */
export function appendBacklogItem(
  text: string,
  item: NewBacklogItem,
): { text: string; id: string } {
  const src = String(text ?? '')
  const title = String(item.title ?? '')
    .trim()
    .replace(/ {2,}/g, ' ')
  const prio = /^P[0-3]$/i.test(String(item.priority ?? '').trim())
    ? String(item.priority).trim().toUpperCase()
    : 'P2'
  const note = String(item.note ?? '').trim()
  const id = nextBacklogId(src)

  const entry: string[] = ['### ' + id + '. ' + title, '']
  if (note) {
    for (const l of note.split(NL)) entry.push(l)
    entry.push('')
  }

  const lines = src.split(NL)
  const headerRe = new RegExp('^##[ ]+' + prio + '(?![0-9])')
  let at = -1
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) {
      // Insert right after the header and any blank lines that follow it, so
      // the newest note sits at the top of its priority block.
      let j = i + 1
      while (j < lines.length && lines[j].trim() === '') j++
      at = j
      break
    }
  }
  if (at === -1) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    const out = lines.concat(['', '## ' + prio, '', ...entry]).join(NL)
    return { text: out, id }
  }
  const out = lines.slice(0, at).concat(entry, lines.slice(at)).join(NL)
  return { text: out, id }
}
