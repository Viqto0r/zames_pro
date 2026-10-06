import fs from 'fs/promises'
import path from 'path'
import { looksLikeFilePath, isImageName } from './attachments.js'
import { extractAtFileRefs } from './path-token.js'

// Path resolution and `@file` reference inlining (BACKLOG B5, C3).
// Extracted from src/index.ts so the logic is unit-testable without the whole
// CLI. This module touches only the filesystem (no browser/terminal).

const NL = String.fromCharCode(10)

export interface AtRefResult {
  text: string
  inlined: string[]
}

// Resolve a pasted string into a path to an EXISTING file. Handles quoted
// paths (drag&drop from some file managers adds quotes) and paths relative to
// the working directory. Returns null when nothing matches.
export async function resolveAttachPath(
  workdir: string,
  raw: string,
): Promise<string | null> {
  let s = String(raw || '').trim()
  if (!s) return null
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1)
  }
  s = s.replace(/\\ /g, ' ')
  if (!looksLikeFilePath(s) && !isImageName(s)) return null
  const candidates = path.isAbsolute(s)
    ? [s]
    : [
        // Most common: relative to the project (working) directory.
        path.resolve(workdir, s),
        // The operator may paste a path relative to the terminal cwd (which
        // can be the parent of the project) or copy it with the project name
        // included, e.g. "zames_pro/tmp/image.png" while workdir is already
        // .../zames_pro. Try both so the marker appears instead of raw text.
        path.resolve(process.cwd(), s),
        path.resolve(workdir, '..', s),
      ]
  for (const c of candidates) {
    const st = await fs.stat(c).catch(() => null)
    if (st && st.isFile()) return c
  }
  return null
}

// Per-file and total caps for `@path` inlining (B5). A reference should SAVE
// round-trips, not flood the context: a huge file is truncated with a note
// telling the agent to read the rest itself.
export const AT_REF_FILE_CAP = 60 * 1024
export const AT_REF_TOTAL_CAP = 200 * 1024

// Inline `@path` references found in a task text (B5). Returns the augmented
// text plus the list of files actually inlined (for the operator notice).
// Unknown/unreadable references are left in place untouched -- they may be
// part of the prose; we never fail the task over a missing file.
export async function inlineAtRefs(
  workdir: string,
  text: string,
): Promise<AtRefResult> {
  const refs = extractAtFileRefs(text)
  if (!refs.length) return { text, inlined: [] }
  const blocks: string[] = []
  const inlined: string[] = []
  let total = 0
  for (const ref of refs) {
    if (total >= AT_REF_TOTAL_CAP) break
    const file = await resolveAttachPath(workdir, ref)
    if (!file) continue
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf-8')
    } catch {
      continue
    }
    let body = raw
    let note = ''
    if (body.length > AT_REF_FILE_CAP) {
      body = body.slice(0, AT_REF_FILE_CAP)
      note = NL + NL + '(truncated at ' + AT_REF_FILE_CAP + ' chars)'
    }
    total += body.length
    inlined.push(path.relative(workdir, file) || file)
    blocks.push('### ' + ref + NL + '```' + NL + body + NL + '```' + note)
  }
  if (!blocks.length) return { text, inlined: [] }
  const section =
    NL +
    NL +
    '## Files referenced with @ in the task' +
    NL +
    NL +
    blocks.join(NL + NL)
  return { text: text + section, inlined }
}
