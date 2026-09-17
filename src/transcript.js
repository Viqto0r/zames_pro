import fs from 'fs'
import path from 'path'

export class Transcript {
  constructor({ dir, enabled = true, sessionName = 'session' } = {}) {
    this.enabled = enabled
    this.file = null
    this.stream = null
    this.startedAt = Date.now()

    if (!enabled) return

    try {
      fs.mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      this.file = path.join(dir, `${sessionName}-${stamp}.jsonl`)
      this.stream = fs.createWriteStream(this.file, { flags: 'a' })
    } catch (e) {
      console.error(`transcript: не удалось создать файл: ${e.message}`)
      this.enabled = false
    }
  }

  log(type, data = {}) {
    if (!this.enabled || !this.stream) return
    const entry = {
      ts: new Date().toISOString(),
      elapsed: Date.now() - this.startedAt,
      type,
      ...data,
    }
    try {
      this.stream.write(JSON.stringify(entry) + '\n')
    } catch {}
  }

  close() {
    if (this.stream) this.stream.end()
  }
}
