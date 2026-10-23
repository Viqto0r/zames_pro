import fs from 'fs/promises'
import path from 'path'
import type { ToolArgs, ToolDef } from './types.js'
import { safePath } from './sandbox.js'
import type { UndoStore } from './undo.js'

// Extra tools that bring zames closer to Claude Code / Codex CLI:
//   * LS         - list a directory (Claude Code has LS; Codex has list_dir)
//   * MultiEdit  - several edits to ONE file applied atomically (Claude Code)
//   * ApplyPatch - multi-file V4A-style patch (Codex apply_patch)
//   * TodoWrite  - session task checklist (Claude Code TodoWrite)
//
// The core file tools (Read/Write/Edit/Bash/Glob/Grep) live in tools.ts.
// These are additive: they do not change the existing tool behaviour.

const NL = String.fromCharCode(10)

function decodeContent(content: unknown, contentBase64: unknown): string {
  if (typeof contentBase64 === 'string' && contentBase64.length) {
    // Reject undecodable base64: Buffer.from(..., 'base64') silently drops
    // invalid characters and returns garbage, which would patch with corrupt
    // text and no error (same guard as tools.ts).
    const compact = contentBase64.replace(/\s+/g, '')
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
      throw new Error(
        'base64 argument is not valid (expected only A-Za-z0-9+/=). ' +
          'Re-send as plain text or as clean base64.',
      )
    }
    return Buffer.from(compact, 'base64').toString('utf-8')
  }
  return String(content ?? '')
}

// ---------- TodoWrite ----------

export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

// The todo list is session state. It lives in a TodoStore so the caller can
// inject ONE shared instance (index.ts does): the logic modules are
// hot-reloadable, and module-level state here would be silently lost on
// /reload. The default store keeps the simple callers (tests) working.
export interface TodoStore {
  items: TodoItem[]
  /** Called after every change so the caller can persist the list. */
  onChange?: (items: TodoItem[]) => void
}

const defaultTodoStore: TodoStore = { items: [] }

export function createTodoStore(
  onChange?: (items: TodoItem[]) => void,
): TodoStore {
  return { items: [], onChange }
}

export function getTodos(store: TodoStore = defaultTodoStore): TodoItem[] {
  return store.items.map((t) => ({ ...t }))
}

export function resetTodos(store: TodoStore = defaultTodoStore): void {
  store.items.length = 0
}

// Replace the whole list. Used by TodoWrite and by the session restore (which
// re-injects the persisted checklist).
export function setTodos(
  items: TodoItem[],
  store: TodoStore = defaultTodoStore,
): void {
  const clean = normalizeTodos(items)
  store.items.length = 0
  store.items.push(...clean)
  store.onChange?.(store.items.map((t) => ({ ...t })))
}

export function renderTodos(items: TodoItem[]): string {
  if (!items.length) return 'Todo list is empty.'
  const mark = (s: string): string =>
    s === 'completed' ? '[x]' : s === 'in_progress' ? '[~]' : '[ ]'
  const lines = items.map((t, i) => `${i + 1}. ${mark(t.status)} ${t.content}`)
  const done = items.filter((t) => t.status === 'completed').length
  return `Todo list (${done}/${items.length} done):${NL}${lines.join(NL)}`
}

export function normalizeTodos(list: unknown[]): TodoItem[] {
  const items: TodoItem[] = []
  for (const raw of list) {
    const it = (raw || {}) as Record<string, unknown>
    const content = String(it.content ?? it.text ?? '').trim()
    if (!content) continue
    const s = String(it.status ?? 'pending')
    const status: TodoItem['status'] =
      s === 'completed' || s === 'done'
        ? 'completed'
        : s === 'in_progress' || s === 'active'
          ? 'in_progress'
          : 'pending'
    items.push({ content, status })
  }
  return items
}

// ---------- ApplyPatch (V4A subset) ----------

export interface PatchOp {
  op: 'add' | 'update' | 'delete'
  file: string
  lines: string[]
}

/** Parse a V4A-style patch body into operations. Exported for tests. */
export function parsePatch(text: string): { ops: PatchOp[]; error?: string } {
  const raw = String(text ?? '').replace(/\r\n/g, NL)
  if (!/^\s*\*\*\*\s*Begin Patch/m.test(raw)) {
    return { ops: [], error: 'Patch must start with "*** Begin Patch".' }
  }
  if (!/\*\*\*\s*End Patch/.test(raw)) {
    return { ops: [], error: 'Patch must end with "*** End Patch".' }
  }

  const beginIdx = raw.indexOf('*** Begin Patch')
  const endIdx = raw.lastIndexOf('*** End Patch')
  const beginLineEnd = raw.indexOf(NL, beginIdx)
  const body = raw.slice(
    beginLineEnd === -1 ? beginIdx : beginLineEnd + 1,
    endIdx,
  )

  const ops: PatchOp[] = []
  let current: PatchOp | null = null

  for (const line of body.split(NL)) {
    const header = line.match(/^\*\*\*\s*(Add|Update|Delete) File:\s*(.+?)\s*$/)
    if (header) {
      const kind = header[1].toLowerCase()
      const file = header[2].trim()
      if (!file) return { ops: [], error: 'Patch header has an empty path.' }
      if (path.isAbsolute(file) || /(^|[\\/])\.\.([\\/]|$)/.test(file)) {
        return {
          ops: [],
          error: 'Patch path must stay inside the project: ' + file,
        }
      }
      current = { op: kind as PatchOp['op'], file, lines: [] }
      ops.push(current)
      continue
    }
    if (current) current.lines.push(line.replace(/\r$/, ''))
  }

  if (!ops.length)
    return { ops: [], error: 'Patch contains no file operations.' }
  return { ops }
}

interface HunkBlock {
  /** Old-side start line from the `@@ -a,b +c,d @@` header (1-based), if any. */
  oldStart: number | null
  lines: string[]
}

/** Split a hunk list into per-`@@` blocks, remembering each header position. */
function splitHunks(hunkLines: string[]): HunkBlock[] {
  const blocks: HunkBlock[] = [{ oldStart: null, lines: [] }]
  for (const l of hunkLines) {
    if (l.startsWith('@@')) {
      const m = l.match(/^@@\s*-(\d+)/)
      blocks.push({ oldStart: m ? Number(m[1]) : null, lines: [] })
      continue
    }
    blocks[blocks.length - 1].lines.push(l)
  }
  return blocks.filter((b) => b.lines.length > 0)
}

const hunkNorm = (s: string, mode: string): string => {
  if (mode === 'exact') return s
  if (mode === 'trim') return s.replace(/[ \t]+$/, '')
  return s.replace(/\s+/g, '')
}

/**
 * Find where a block's old side starts in `fileLines`.
 * `from` is the lowest index allowed (hunks must not overlap / go backwards).
 * When the header named a line, that position is preferred: repeated context
 * is otherwise ambiguous and the wrong occurrence gets patched.
 */
function locateBlock(
  fileLines: string[],
  oldLines: string[],
  oldStart: number | null,
  from: number,
): number {
  const maxStart = fileLines.length - oldLines.length
  if (maxStart < from) return -1
  for (const mode of ['exact', 'trim', 'ws']) {
    const anchor = oldLines.map((l) => hunkNorm(l, mode))
    const matches = (i: number): boolean => {
      for (let j = 0; j < anchor.length; j++) {
        if (hunkNorm(fileLines[i + j], mode) !== anchor[j]) return false
      }
      return true
    }
    if (oldStart !== null) {
      const hinted = oldStart - 1
      if (hinted >= from && hinted <= maxStart && matches(hinted)) return hinted
    }
    for (let i = from; i <= maxStart; i++) {
      if (matches(i)) return i
    }
  }
  return -1
}

/**
 * Apply an update hunk to existing content using context matching.
 * The hunk is a list of lines prefixed with ' ' (context), '-' (remove),
 * '+' (add). Several `@@` hunks for one file are applied in order, top to
 * bottom. A block is located by exact match, then ignoring trailing
 * whitespace, then ignoring all whitespace (like Codex).
 */
export function applyUpdateHunk(
  content: string,
  hunkLines: string[],
): { ok: boolean; content?: string; error?: string } {
  const hasCRLF = content.includes('\r\n')
  const eol = hasCRLF ? '\r\n' : NL
  let fileLines = content.split(/\r?\n/)

  for (const block of splitHunks(hunkLines)) {
    const oldLines: string[] = []
    const newLines: string[] = []
    for (const l of block.lines) {
      // A blank hunk line is the newline BEFORE "*** End Patch", not a
      // context line: counting it as context demanded an extra blank file
      // line and made every realistic multi-hunk patch fail.
      if (l === '') continue
      if (l.startsWith('+')) {
        newLines.push(l.slice(1))
      } else if (l.startsWith('-')) {
        oldLines.push(l.slice(1))
      } else if (l.startsWith(' ')) {
        oldLines.push(l.slice(1))
        newLines.push(l.slice(1))
      } else {
        oldLines.push(l)
        newLines.push(l)
      }
    }

    if (!oldLines.length) {
      return {
        ok: false,
        error: 'Hunk has no context or removed lines to anchor on.',
      }
    }

    const at = locateBlock(fileLines, oldLines, block.oldStart, 0)
    if (at === -1) {
      return {
        ok: false,
        error:
          'Context not found in the file (hunk did not match): ' +
          oldLines[0].slice(0, 60),
      }
    }
    fileLines = [
      ...fileLines.slice(0, at),
      ...newLines,
      ...fileLines.slice(at + oldLines.length),
    ]
  }

  return { ok: true, content: fileLines.join(eol) }
}

// ---------- factory ----------

export function createExtraTools(
  workdir: string,
  { undo, todos }: { undo?: UndoStore | null; todos?: TodoStore } = {},
): ToolDef[] {
  const todoStore = todos || defaultTodoStore
  const root = path.resolve(workdir)
  const safe = (p: string): string => safePath(root, p)

  // Guard against missing/placeholder required args: a missing `path` becomes
  // String(undefined) === "undefined" and would create a file literally named
  // "undefined" in the working directory.
  const req = (v: unknown, name: string): string => {
    if (v === undefined || v === null) {
      throw new Error(
        `Missing required argument: ${name}. Add "${name}" to the tool call arguments and retry.`,
      )
    }
    // `path`/`pattern` are strings by contract; an OBJECT used to become
    // "[object Object]" and reach the fs layer as a literal file name.
    if (typeof v === 'object' || typeof v === 'function') {
      throw new Error(
        `Invalid required argument ${name}: expected a string, got ` +
          JSON.stringify(v) +
          '. Re-send the call with a plain string value.',
      )
    }
    const s = String(v)
    if (s === '' || s === 'undefined' || s === 'null') {
      throw new Error(
        `Invalid required argument ${name}: ${JSON.stringify(v)}. Provide a non-empty value for "${name}" and retry.`,
      )
    }
    return s
  }

  return [
    {
      name: 'LS',
      description:
        'List the contents of a directory (files and subfolders). ' +
        'path defaults to the working directory. Folders are marked with a slash.',
      parameters: { path: 'string?', ignore: 'string?' },
      fn: async ({ path: p, ignore }: ToolArgs) => {
        const target = p ? safe(req(p, 'path')) : root
        const stat = await fs.stat(target).catch(() => null)
        if (!stat) throw new Error('No such directory: ' + p)
        if (!stat.isDirectory()) throw new Error('Not a directory: ' + p)

        const ignoreList = (ignore ? String(ignore) : '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)

        const entries = await fs.readdir(target, { withFileTypes: true })
        const rows: string[] = []
        for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
          if (ignoreList.includes(e.name)) continue
          if (e.name === 'node_modules' || e.name === '.git') {
            rows.push(e.name + '/ (skipped)')
            continue
          }
          if (e.isDirectory()) {
            rows.push(e.name + '/')
          } else {
            const full = path.join(target, e.name)
            const st = await fs.stat(full).catch(() => null)
            rows.push(e.name + (st ? `  (${st.size} bytes)` : ''))
          }
        }
        return rows.length ? rows.join(NL) : '(empty)'
      },
    },

    {
      name: 'MultiEdit',
      description:
        'Several targeted edits to ONE file in a single call. edits is an array of ' +
        '{old_string, new_string, replace_all?}. Edits are applied ' +
        'in order; if any is not found — none are applied. ' +
        'For a single edit use Edit.',
      parameters: {
        path: 'string',
        edits: 'array',
        edits_base64: 'string?',
      },
      fn: async ({ path: p, edits, edits_base64 }: ToolArgs) => {
        const file = safe(req(p, 'path'))
        let list: Array<{
          old_string?: string
          new_string?: string
          replace_all?: boolean
        }>
        if (typeof edits_base64 === 'string' && edits_base64.length) {
          list = JSON.parse(
            Buffer.from(edits_base64, 'base64').toString('utf-8'),
          )
        } else if (Array.isArray(edits)) {
          list = edits as typeof list
        } else {
          throw new Error('edits must be an array of edits.')
        }
        if (!list.length) throw new Error('edits is empty — nothing to apply.')

        let content = await fs.readFile(file, 'utf-8')

        for (let i = 0; i < list.length; i++) {
          const e = list[i]
          const oldStr = String(e.old_string ?? '')
          // A missing new_string must not mean "delete": String(undefined) is
          // '' and the edit silently ERASED the matched text (the same data
          // loss fixed in the single-file Edit). An EXPLICIT '' still deletes.
          if (e.new_string === undefined || e.new_string === null) {
            throw new Error(
              `edits[${i}]: new_string is missing. Add the replacement text ` +
                '(use an empty string to delete) and retry.',
            )
          }
          const newStr = String(e.new_string)
          if (oldStr === '') {
            throw new Error(`edits[${i}]: old_string is empty.`)
          }
          const occurrences = content.split(oldStr).length - 1
          if (occurrences === 0) {
            throw new Error(
              `edits[${i}]: string not found: "${oldStr.slice(0, 60)}..."`,
            )
          }
          if (occurrences > 1 && !e.replace_all) {
            throw new Error(
              `edits[${i}]: string occurs ${occurrences} times. ` +
                'Make old_string more specific or pass replace_all=true.',
            )
          }
          if (e.replace_all) {
            content = content.split(oldStr).join(newStr)
          } else {
            // Functional replacer: a string replacer would interpret $-patterns
            // ($&, $$, $1) inside newStr and corrupt the written text.
            content = content.replace(oldStr, () => newStr)
          }
        }

        if (undo) await undo.backup(file)
        await fs.writeFile(file, content, 'utf-8')
        return `Edited (${list.length} edits): ${p}`
      },
    },

    {
      name: 'TodoWrite',
      description:
        'Create/update the session task list. Accepts todos — an array of ' +
        '{content, status}, where status: pending | in_progress | completed. ' +
        'Helps track multi-step tasks. Replaces the whole list.',
      parameters: { todos: 'array', todos_base64: 'string?' },
      fn: async ({ todos, todos_base64 }: ToolArgs) => {
        let list: unknown[]
        if (typeof todos_base64 === 'string' && todos_base64.length) {
          list = JSON.parse(
            Buffer.from(todos_base64, 'base64').toString('utf-8'),
          )
        } else if (Array.isArray(todos)) {
          list = todos
        } else {
          throw new Error('todos must be an array.')
        }
        setTodos(normalizeTodos(list), todoStore)
        return renderTodos(todoStore.items)
      },
    },

    {
      name: 'ApplyPatch',
      description:
        'Apply a patch to several files in a single call (Codex format). ' +
        'Body: "*** Begin Patch", operations "*** Add File: <path>" (lines with +), ' +
        '"*** Update File: <path>" (context with a space, removals with -, additions ' +
        'with +, @@ anchors optional), "*** Delete File: <path>", then ' +
        '"*** End Patch". Paths must be relative and inside the project.',
      parameters: { patch: 'string?', patch_base64: 'string?' },
      fn: async ({ patch, patch_base64 }: ToolArgs) => {
        const text = decodeContent(patch, patch_base64)
        const { ops, error } = parsePatch(text)
        if (error) throw new Error(error)

        // Stage every change first, then write.
        const writes: Array<{ file: string; content: string | null }> = []
        for (const op of ops) {
          const file = safe(op.file)
          if (op.op === 'delete') {
            writes.push({ file, content: null })
            continue
          }
          if (op.op === 'add') {
            // `Add File:` means CREATE. Applied to an existing file it used to
            // silently OVERWRITE the whole file (the writer just writes the
            // body), so a stale or wrong path destroyed real content with no
            // warning. Refuse; Update/Delete remain for existing files.
            if (
              await fs
                .stat(file)
                .then(() => true)
                .catch(() => false)
            ) {
              throw new Error(
                'Add File ' +
                  op.file +
                  ': the file already exists. Use Update File to change it.',
              )
            }
            const body = op.lines
              .filter((l) => l.startsWith('+'))
              .map((l) => l.slice(1))
              .join(NL)
            writes.push({ file, content: body + NL })
            continue
          }
          let current: string
          try {
            current = await fs.readFile(file, 'utf-8')
          } catch {
            throw new Error('Update File: no such file ' + op.file)
          }
          const res = applyUpdateHunk(current, op.lines)
          if (!res.ok) {
            throw new Error('Update File ' + op.file + ': ' + res.error)
          }
          writes.push({ file, content: res.content as string })
        }

        const summary: string[] = []
        for (const w of writes) {
          if (undo) await undo.backup(w.file)
          if (w.content === null) {
            await fs.unlink(w.file).catch(() => {})
            summary.push('deleted ' + path.relative(root, w.file))
          } else {
            await fs.mkdir(path.dirname(w.file), { recursive: true })
            await fs.writeFile(w.file, w.content, 'utf-8')
            summary.push('written ' + path.relative(root, w.file))
          }
        }
        return 'Patch applied:' + NL + summary.join(NL)
      },
    },
  ]
}
