import fs from 'fs/promises'
import path from 'path'
import { looksLikeFilePath, isImageName } from './attachments.js'
import { extractAtFileRefs } from './path-token.js'

// Path resolution and `@file` reference inlining.
// Extracted from src/index.ts so the logic is unit-testable without the whole
// CLI. This module touches only the filesystem (no browser/terminal).

const NL = String.fromCharCode(10)

// A NUL byte in the head is the classic binary signal (text files essentially
// never contain one). Only the head is scanned: a huge archive must not be
// walked byte-by-byte just to decide it is not text.
function isBinaryBuffer(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000)
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true
  }
  return false
}

export interface AtRefResult {
  text: string
  inlined: string[]
}

// Resolve a pasted string into a path to an EXISTING file. Handles quoted
// paths (drag&drop from some file managers adds quotes) and paths relative to
// the working directory. Returns null when nothing matches.
//
// Every candidate is checked against the sandbox root (the REAL path, so
// a symlink escape is refused too). The `..`/cwd candidates exist to help an
// operator paste a path that LOOKS relative to the project, not to grant
// access above it: without this guard a reference with a `..` inlined a file
// outside the sandbox, while every other file tool rejects that path via
// safePath(). The search continues past an escaping candidate (a regular
// file inside the project must still resolve), but no candidate outside is
// ever returned.
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
  // A URL is never a local file. `isImageName` alone would still accept
  // `https://example.com/a.png` (it only looks at the extension), and the
  // RELATIVE candidate `path.resolve(workdir, 'https://…')` then becomes
  // `https:/…` — a project that happens to have such a directory silently
  // attached the URL as a file. A URL preceded by prose words is covered too
  // (the same rule as looksLikeFilePath).
  if (/(?:^|\s)[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(s)) return null
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
    if (!st || !st.isFile()) continue
    if (await isInside(workdir, c)) return c
  }
  return null
}

// True when the REAL path of `target` stays under the REAL workdir root.
// realpath (not the lexical path) is required here for the same reason as
// safePath() in src/sandbox.ts: a symlink inside the project can point
// outside it.
async function isInside(workdir: string, target: string): Promise<boolean> {
  const root = await fs.realpath(path.resolve(workdir)).catch(() => null)
  const real = await fs.realpath(target).catch(() => null)
  if (!root || !real) return false
  const rel = path.relative(root, real)
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

// Per-file and total caps for `@path` inlining. A reference should SAVE
// round-trips, not flood the context: a huge file is truncated with a note
// telling the agent to read the rest itself.
export const AT_REF_FILE_CAP = 60 * 1024
export const AT_REF_TOTAL_CAP = 200 * 1024

// Inline `@path` references found in a task text. Returns the augmented
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
    let buf: Buffer
    try {
      buf = await fs.readFile(file)
    } catch {
      continue
    }
    // A BINARY file (an image, an archive, a compiled blob) read as UTF-8
    // becomes replacement characters and NUL bytes in the prompt — the model
    // cannot use that, and the reference was still counted as inlined. Leave
    // it in the text as a plain `@path` reference (the same answer the Read
    // tool gives for a binary file).
    if (isBinaryBuffer(buf)) continue
    const raw = buf.toString('utf-8')
    let body = raw
    let note = ''
    // The per-file cap alone lets the TOTAL budget be overshot: a file that
    // fits AT_REF_FILE_CAP was inlined WHOLE even when only a few KB of the
    // total were left, so four references produced a 245 KB section while the
    // cap promises 200 KB. Budget the cut by what is left, and stop adding
    // files once the pool is spent.
    const room = AT_REF_TOTAL_CAP - total
    if (room <= 0) break
    const cap = Math.min(AT_REF_FILE_CAP, room)
    if (body.length > cap) {
      let cut = cap
      // Never end the inlined block on a lone HIGH surrogate: the cut is in
      // UTF-16 units, so an emoji / astral CJK char on the boundary would
      // reach the model as a broken code point (same rule as
      // truncateToolResult / capReport / cutHookText).
      const last = body.charCodeAt(cut - 1)
      if (last >= 0xd800 && last <= 0xdbff) cut--
      body = body.slice(0, cut)
      note =
        NL +
        NL +
        '(truncated at ' +
        cap +
        ' chars; the task total cap is ' +
        AT_REF_TOTAL_CAP +
        ')'
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
