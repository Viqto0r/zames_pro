import fs from 'fs/promises'
import path from 'path'
import os from 'os'

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
    await fs.writeFile(INDEX, JSON.stringify(history, null, 2))
  }

  async backup(
    filePath: string,
  ): Promise<Omit<UndoRecord, 'backupFile'> | null> {
    if (!this.enabled) return null
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
    const hash = Buffer.from(filePath).toString('hex').slice(0, 16)

    let backupFile: string | null = null
    if (existed) {
      backupFile = path.join(UNDO_DIR, `${stamp}-${hash}.bak`)
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
    if (!this.enabled) return { ok: false, reason: 'undo отключён в конфиге' }
    await this._ensure()

    const history = await this._readIndex()
    if (!history.length) return { ok: false, reason: 'история пуста' }

    const record = history.pop()
    if (!record) return { ok: false, reason: 'история пуста' }
    const { originalPath, existed, backupFile } = record

    try {
      if (existed && backupFile) {
        const data = await fs.readFile(backupFile)
        await fs.writeFile(originalPath, data)
        try {
          await fs.unlink(backupFile)
        } catch {}
      } else {
        try {
          await fs.unlink(originalPath)
        } catch {}
      }
      await this._writeIndex(history)
      return { ok: true, record }
    } catch (e) {
      return { ok: false, reason: (e as Error).message }
    }
  }

  async list(count = 10): Promise<UndoRecord[]> {
    const history = await this._readIndex()
    return history.slice(-count).reverse()
  }
}
