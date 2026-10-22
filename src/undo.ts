import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { randomBytes, createHash } from 'crypto'
import { writeJsonAtomic } from './fsutil.js'

const UNDO_DIR = path.join(os.homedir(), '.zames', 'undo')
const INDEX = path.join(UNDO_DIR, 'index.json')

interface UndoRecord {
  originalPath: string
  existed: boolean
  stamp: number
  backupFile: string | null
}

export interface UndoResult {
  ok: boolean
  reason?: string
  record?: UndoRecord
}

export class UndoStore {
  enabled: boolean
  maxBackups: number

  constructor({
    enabled = true,
    maxBackups = 200,
  }: { enabled?: boolean; maxBackups?: number } = {}) {
    this.enabled = enabled
    this.maxBackups = maxBackups
  }

  async _ensure(): Promise<void> {
    await fs.mkdir(UNDO_DIR, { recursive: true })
  }

  async _readIndex(): Promise<UndoRecord[]> {
    try {
      return JSON.parse(await fs.readFile(INDEX, 'utf-8'))
    } catch {
      return []
    }
  }

  async _writeIndex(history: UndoRecord[]): Promise<void> {
    // Atomic write: a crash mid-write must not corrupt the undo history.
    writeJsonAtomic(INDEX, history)
  }

  async backup(
    filePath: string,
  ): Promise<Omit<UndoRecord, 'backupFile'> | null> {
    if (!this.enabled) return null
    // A retention of ZERO means "keep nothing": the record would be pushed and
    // immediately shifted out (with its .bak unlinked) while the caller was
    // told the backup happened — /undo then had nothing to revert. Report
    // honestly that no backup was taken.
    if (this.maxBackups <= 0) return null
    await this._ensure()

    let content: Buffer | null = null
    let existed = false
    try {
      content = await fs.readFile(filePath)
      existed = true
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }

    const stamp = Date.now()
    // The name only needs to be SHORT and unique; the backup name also
    // carries a random suffix. A 16-hex prefix of the hex-encoded path is
    // the first 8 BYTES of the path, which for files in one directory is
    // the SAME string (and identical without the random part).
    const hash = createHash('sha1').update(filePath).digest('hex').slice(0, 16)

    let backupFile: string | null = null
    if (existed) {
      // The stamp is only ms-precision, so two edits in the same
      // millisecond would share a backup name and the second write would
      // clobber the first (losing the backup). Add a random suffix so a
      // backup name is unique.
      const uniq = randomBytes(4).toString('hex')
      backupFile = path.join(UNDO_DIR, `${stamp}-${hash}-${uniq}.bak`)
      await fs.writeFile(backupFile, content as Buffer)
    }

    const history = await this._readIndex()
    history.push({ originalPath: filePath, existed, stamp, backupFile })

    while (history.length > this.maxBackups) {
      const old = history.shift()
      if (old && old.backupFile) {
        try {
          await fs.unlink(old.backupFile)
        } catch {}
      }
    }

    await this._writeIndex(history)
    return { originalPath: filePath, existed, stamp }
  }

  async undoLast(): Promise<UndoResult> {
    // Machine codes, NOT prose: the caller (index.ts) localizes them through
    // the i18n catalog. Hardcoding a Russian reason here leaked Russian into
    // an English UI (`/undo` with an empty history).
    if (!this.enabled) return { ok: false, reason: 'disabled' }
    await this._ensure()

    const history = await this._readIndex()
    if (!history.length) return { ok: false, reason: 'empty' }

    // Walk back from the newest record and SKIP a dead one (its .bak vanished,
    // e.g. ~/.zames/undo was pruned or a crash left a record without the file).
    // The old code popped the dead record, failed, and never rewrote the index —
    // so every later /undo hit the same record again and the earlier backups
    // stayed unreachable.
    while (history.length) {
      const record = history.pop()
      if (!record) break
      const { originalPath, existed, backupFile } = record
      let data: Buffer | null = null
      if (existed && backupFile) {
        try {
          data = await fs.readFile(backupFile)
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue
          return { ok: false, reason: (e as Error).message }
        }
      }
      try {
        if (data) {
          await fs.writeFile(originalPath, data)
          try {
            await fs.unlink(backupFile as string)
          } catch {}
        } else {
          // existed === false: the agent CREATED the file, so undoing removes
          // it again. ENOENT is the expected case (it is already gone).
          try {
            await fs.unlink(originalPath)
          } catch {}
        }
        await this._writeIndex(history)
        return { ok: true, record }
      } catch (e) {
        // A real failure (permissions, a directory in place of the file): put
        // the record back so a retry after fixing the cause still works.
        history.push(record)
        await this._writeIndex(history)
        return { ok: false, reason: (e as Error).message }
      }
    }
    await this._writeIndex(history)
    return { ok: false, reason: 'empty' }
  }

  async list(count = 10): Promise<UndoRecord[]> {
    const history = await this._readIndex()
    return history.slice(-count).reverse()
  }
}
