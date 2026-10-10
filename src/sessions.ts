import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Session } from './types.js'
import { writeJsonAtomic } from './fsutil.js'

// We store sessions (DeepSeek chats) in a separate folder so they aren't lost
// after a process restart. Each session is a separate JSON file
// <id>.json in ~/.zames/.sessions. last.json points to the last
// opened session for a specific working directory.
const SESSIONS_DIR = path.join(os.homedir(), '.zames', '.sessions')
const INDEX_FILE = path.join(SESSIONS_DIR, 'last.json')

interface SessionsIndex {
  last?: string | null
  byWorkdir?: Record<string, string>
  updatedAt?: string
}

export const SESSIONS_FORMAT_VERSION = 1

// Subagent chats are real DeepSeek chats, but they are INTERNAL: they exist
// only to isolate a sub-task's context and their report is already folded back
// into the parent chat. They must never be resumable. DeepSeek's own sidebar
// (`/chats`, which scrapes the DOM) still shows them under auto-generated
// titles, so we cannot hide them there; but we CAN hide them from `/sessions`
// (our own store) by keeping an id denylist here and filtering every read path.
const INTERNAL_FILE = path.join(SESSIONS_DIR, 'internal.json')

function readInternal(): Set<string> {
  try {
    const raw = JSON.parse(fs.readFileSync(INTERNAL_FILE, 'utf-8'))
    return new Set(
      Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [],
    )
  } catch {
    return new Set()
  }
}

/** Remember a chat id as internal (a subagent chat) so it is never resumed. */
export function markInternalChat(id: string | null | undefined): void {
  if (!id) return
  try {
    ensureDir()
    const set = readInternal()
    set.add(String(id))
    writeJsonAtomic(INTERNAL_FILE, Array.from(set))
  } catch {}
}

/** True when `id` is a known internal (subagent) chat. */
export function isInternalChat(id: string | null | undefined): boolean {
  if (!id) return false
  return readInternal().has(String(id))
}

function ensureDir(): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

function safeName(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9_.-]/g, '_')
}

// Save/update a session. workdir is needed so that when launched from the same
// project we restore exactly its last chat.
export function saveSession({
  id,
  title = '',
  workdir = '',
  todos,
}: {
  id: string
  title?: string
  workdir?: string
  todos?: Array<{ content: string; status: string }>
}): Session | null {
  if (!id) return null
  try {
    ensureDir()
    const file = path.join(SESSIONS_DIR, safeName(id) + '.json')
    let prev: Partial<Session> = {}
    try {
      prev = JSON.parse(fs.readFileSync(file, 'utf-8'))
    } catch {}
    const now = new Date().toISOString()
    const data: Session = {
      id,
      title: title || prev.title || '',
      workdir: workdir || prev.workdir || '',
      createdAt: prev.createdAt || now,
      updatedAt: now,
      version: SESSIONS_FORMAT_VERSION,
    }
    // Keep the previous checklist unless a new one is explicitly passed —
    // saveLastChat() calls this for title/workdir only and must not wipe it.
    const nextTodos = todos !== undefined ? todos : prev.todos
    if (nextTodos !== undefined) data.todos = nextTodos
    writeJsonAtomic(file, data)
    writeIndex({ id, workdir: data.workdir })
    return data
  } catch {
    return null
  }
}

function writeIndex({ id, workdir }: { id: string; workdir: string }): void {
  try {
    ensureDir()
    let index: SessionsIndex = {}
    try {
      index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'))
    } catch {}
    if (!index || typeof index !== 'object') index = {}
    if (!index.byWorkdir || typeof index.byWorkdir !== 'object') {
      index.byWorkdir = {}
    }
    const key = workdir || ''
    index.byWorkdir[key] = id
    index.last = id
    index.updatedAt = new Date().toISOString()
    writeJsonAtomic(INDEX_FILE, index)
  } catch {}
}

// The last session for the working directory. If there is none —
// we return the last session overall (useful when launched from a new place).
export function loadLastSession(workdir = ''): Session | null {
  try {
    const index: SessionsIndex = JSON.parse(
      fs.readFileSync(INDEX_FILE, 'utf-8'),
    )
    const byWorkdir = index && index.byWorkdir ? index.byWorkdir : {}
    const candidates = [byWorkdir[workdir], index.last].filter(
      (x): x is string => Boolean(x),
    )
    const internal = readInternal()
    for (const id of candidates) {
      // The session file may have been deleted — the index is then stale and
      // the session cannot be restored. We try the next candidate.
      if (internal.has(id)) continue
      const s = readSession(id)
      if (s) return s
    }
    return null
  } catch {
    return null
  }
}

export function readSession(id: string | null): Session | null {
  if (!id) return null
  try {
    const file = path.join(SESSIONS_DIR, safeName(id) + '.json')
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

// List all sessions, newest first. Internal (subagent) chats are excluded.
export function listSessions(): Session[] {
  try {
    ensureDir()
    const internal = readInternal()
    const files = fs
      .readdirSync(SESSIONS_DIR)
      .filter(
        (f) =>
          f.endsWith('.json') && f !== 'last.json' && f !== 'internal.json',
      )
    const out: Session[] = []
    for (const f of files) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8'),
        )
        if (data && data.id && !internal.has(String(data.id))) out.push(data)
      } catch {}
    }
    out.sort((a, b) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
    )
    return out
  } catch {
    return []
  }
}

export function sessionsDir(): string {
  return SESSIONS_DIR
}

// ---------- input history ----------

// The LineEditor history otherwise dies with the process (it was in-memory
// only), so the arrow keys / Ctrl+R could not recall anything from a previous
// run. We persist it in ~/.zames/history.json, capped so the file cannot grow
// without bound.
const HISTORY_FILE = path.join(os.homedir(), '.zames', 'history.json')
const HISTORY_LIMIT = 500

export function loadHistory(): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'))
    if (!Array.isArray(raw)) return []
    return raw.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

export function saveHistory(history: string[]): void {
  try {
    ensureDir()
    const trimmed = history.slice(-HISTORY_LIMIT)
    writeJsonAtomic(HISTORY_FILE, trimmed)
  } catch {}
}
