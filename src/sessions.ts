import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Session } from './types.js'

// Сессии (чаты DeepSeek) храним в отдельной папке, чтобы они не терялись
// после перезапуска процесса. Каждая сессия — отдельный JSON-файл
// <id>.json в ~/.zames/.sessions. last.json указывает на последнюю
// открытую сессию для конкретной рабочей директории.
const SESSIONS_DIR = path.join(os.homedir(), '.zames', '.sessions')
const INDEX_FILE = path.join(SESSIONS_DIR, 'last.json')

interface SessionsIndex {
  last?: string | null
  byWorkdir?: Record<string, string>
  updatedAt?: string
}

function ensureDir(): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

function safeName(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9_.-]/g, '_')
}

// Сохраняем/обновляем сессию. workdir нужен, чтобы при запуске из того же
// проекта восстанавливать именно его последний чат.
export function saveSession({
  id,
  title = '',
  workdir = '',
}: {
  id: string
  title?: string
  workdir?: string
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
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
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
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8')
  } catch {}
}

// Последняя сессия для рабочей директории. Если для неё ничего нет —
// возвращаем последнюю сессию вообще (полезно при запуске из нового места).
export function loadLastSession(workdir = ''): Session | null {
  try {
    const index: SessionsIndex = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'))
    const byWorkdir = index && index.byWorkdir ? index.byWorkdir : {}
    const candidates = [byWorkdir[workdir], index.last].filter(
      (x): x is string => Boolean(x),
    )
    for (const id of candidates) {
      // Файл сессии мог быть удалён — индекс тогда устарел, и сессию
      // восстанавливать нельзя. Пробуем следующий кандидат.
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

// Список всех сессий, свежие — первыми.
export function listSessions(): Session[] {
  try {
    ensureDir()
    const files = fs
      .readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith('.json') && f !== 'last.json')
    const out: Session[] = []
    for (const f of files) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8'),
        )
        if (data && data.id) out.push(data)
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
