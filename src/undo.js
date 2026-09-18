import fs from 'fs/promises'
import path from 'path'
import os from 'os'

const UNDO_DIR = path.join(os.homedir(), '.zames', 'undo')
const INDEX = path.join(UNDO_DIR, 'index.json')

export class UndoStore {
  constructor({ enabled = true, maxBackups = 200 } = {}) {
    this.enabled = enabled
    this.maxBackups = maxBackups
  }

  async _ensure() {
    await fs.mkdir(UNDO_DIR, { recursive: true })
  }

  async _readIndex() {
    try {
      return JSON.parse(await fs.readFile(INDEX, 'utf-8'))
    } catch {
      return []
    }
  }

  async _writeIndex(history) {
    await fs.writeFile(INDEX, JSON.stringify(history, null, 2))
  }

  async backup(filePath) {
    if (!this.enabled) return null
    await this._ensure()

    let content = null
    let existed = false
    try {
      content = await fs.readFile(filePath)
      existed = true
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }

    const stamp = Date.now()
    const hash = Buffer.from(filePath).toString('hex').slice(0, 16)

    let backupFile = null
    if (existed) {
      backupFile = path.join(UNDO_DIR, `${stamp}-${hash}.bak`)
      await fs.writeFile(backupFile, content)
    }

    const history = await this._readIndex()
    history.push({ originalPath: filePath, existed, stamp, backupFile })

    while (history.length > this.maxBackups) {
      const old = history.shift()
      if (old.backupFile) {
        try {
          await fs.unlink(old.backupFile)
        } catch {}
      }
    }

    await this._writeIndex(history)
    return { originalPath: filePath, existed, stamp }
  }

  async undoLast() {
    if (!this.enabled) return { ok: false, reason: 'undo отключён в конфиге' }
    await this._ensure()

    const history = await this._readIndex()
    if (!history.length) return { ok: false, reason: 'история пуста' }

    const record = history.pop()
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
      return { ok: false, reason: e.message }
    }
  }

  async list(count = 10) {
    const history = await this._readIndex()
    return history.slice(-count).reverse()
  }
}
