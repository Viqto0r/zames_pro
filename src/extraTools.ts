import fs from 'fs/promises'
import path from 'path'
import type { ToolArgs, ToolDef } from './types.js'
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
    return Buffer.from(contentBase64, 'base64').toString('utf-8')
  }
  return String(content ?? '')
}

// ---------- TodoWrite ----------

export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

// The todo list is per-process session state. It is deliberately NOT
// persisted: a fresh run starts with an empty list, like Claude Code's
// session checklist.
const todoList: TodoItem[] = []

export function getTodos(): TodoItem[] {
  return todoList.map((t) => ({ ...t }))
}

export function resetTodos(): void {
  todoList.length = 0
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
  const body = raw.slice(beginLineEnd === -1 ? beginIdx : beginLineEnd + 1, endIdx)

  const ops: PatchOp[] = []
  let current: PatchOp | null = null

  for (const line of body.split(NL)) {
    const header = line.match(/^\*\*\*\s*(Add|Update|Delete) File:\s*(.+?)\s*$/)
    if (header) {
      const kind = header[1].toLowerCase()
      const file = header[2].trim()
      if (!file) return { ops: [], error: 'Patch header has an empty path.' }
      if (path.isAbsolute(file) || /(^|[\\/])\.\.([\\/]|$)/.test(file)) {
        return { ops: [], error: 'Patch path must stay inside the project: ' + file }
      }
      current = { op: kind as PatchOp['op'], file, lines: [] }
      ops.push(current)
      continue
    }
    if (current) current.lines.push(line)
  }

  if (!ops.length) return { ops: [], error: 'Patch contains no file operations.' }
  return { ops }
}

/**
 * Apply an update hunk to existing content using context matching.
 * The hunk is a list of lines prefixed with ' ' (context), '-' (remove),
 * '+' (add). We locate the context block by exact match, then by ignoring
 * trailing whitespace, then by ignoring all whitespace (like Codex).
 */
export function applyUpdateHunk(
  content: string,
  hunkLines: string[],
): { ok: boolean; content?: string; error?: string } {
  const hasCRLF = content.includes('\r\n')
  const fileLines = content.split(/\r?\n/)

  const oldLines: string[] = []
  const newLines: string[] = []
  for (const l of hunkLines) {
    if (l.startsWith('@@')) continue
    if (l.startsWith('+')) {
      newLines.push(l.slice(1))
    } else if (l.startsWith('-')) {
      oldLines.push(l.slice(1))
    } else if (l.startsWith(' ')) {
      oldLines.push(l.slice(1))
      newLines.push(l.slice(1))
    } else if (l === '') {
      oldLines.push('')
      newLines.push('')
    } else {
      oldLines.push(l)
      newLines.push(l)
    }
  }

  if (!oldLines.length) {
    return { ok: false, error: 'Hunk has no context or removed lines to anchor on.' }
  }

  const norm = (s: string, mode: string): string => {
    if (mode === 'exact') return s
    if (mode === 'trim') return s.replace(/[ \t]+$/, '')
    return s.replace(/\s+/g, '')
  }

  for (const mode of ['exact', 'trim', 'ws']) {
    const anchor = oldLines.map((l) => norm(l, mode))
    for (let i = 0; i + anchor.length <= fileLines.length; i++) {
      let match = true
      for (let j = 0; j < anchor.length; j++) {
        if (norm(fileLines[i + j], mode) !== anchor[j]) {
          match = false
          break
        }
      }
      if (!match) continue
      const before = fileLines.slice(0, i)
      const after = fileLines.slice(i + anchor.length)
      const joined = [...before, ...newLines, ...after].join(hasCRLF ? '\r\n' : NL)
      return { ok: true, content: joined }
    }
  }

  return {
    ok: false,
    error:
      'Context not found in the file (hunk did not match): ' +
      oldLines[0].slice(0, 60),
  }
}

// ---------- factory ----------

export function createExtraTools(
  workdir: string,
  { undo }: { undo?: UndoStore | null } = {},
): ToolDef[] {
  const root = path.resolve(workdir)
  const safe = (p: string): string => {
    const resolved = path.resolve(root, p)
    const rel = path.relative(root, resolved)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Access outside the working directory is forbidden: ' + p)
    }
    return resolved
  }

  // Guard against missing/placeholder required args: a missing `path` becomes
  // String(undefined) === "undefined" and would create a file literally named
  // "undefined" in the working directory.
  const req = (v: unknown, name: string): string => {
    if (v === undefined || v === null) {
      throw new Error(`Missing required argument: ${name}`)
    }
    const s = String(v)
    if (s === '' || s === 'undefined' || s === 'null') {
      throw new Error(`Invalid required argument ${name}: ${JSON.stringify(v)}`)
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
          list = JSON.parse(Buffer.from(edits_base64, 'base64').toString('utf-8'))
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
          const newStr = String(e.new_string ?? '')
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
          content = e.replace_all
            ? content.split(oldStr).join(newStr)
            : content.replace(oldStr, newStr)
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
          list = JSON.parse(Buffer.from(todos_base64, 'base64').toString('utf-8'))
        } else if (Array.isArray(todos)) {
          list = todos
        } else {
          throw new Error('todos must be an array.')
        }
        const items = normalizeTodos(list)
        todoList.length = 0
        todoList.push(...items)
        return renderTodos(todoList)
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
