import fs from 'fs'
import path from 'path'
import type { WriteStream } from 'fs'

export interface TranscriptOptions {
  dir: string
  enabled?: boolean
  sessionName?: string
}

export class Transcript {
  enabled: boolean
  file: string | null
  stream: WriteStream | null
  startedAt: number

  constructor({
    dir,
    enabled = true,
    sessionName = 'session',
  }: TranscriptOptions) {
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
      // Write errors (disk full, file deleted, etc.) arrive as an 'error'
      // event; without a listener this is an uncaught exception.
      this.stream.on('error', (e: Error) => {
        console.error(`transcript: ошибка записи: ${e.message}`)
        this.enabled = false
      })
    } catch (e) {
      console.error(
        `transcript: не удалось создать файл: ${(e as Error).message}`,
      )
      this.enabled = false
    }
  }

  log(type: string, data: Record<string, unknown> = {}): void {
    if (!this.enabled || !this.stream) return
    const entry = {
      ts: new Date().toISOString(),
      elapsed: Date.now() - this.startedAt,
      type,
      ...data,
    }
    try {
      this.stream.write(JSON.stringify(entry) + String.fromCharCode(10))
    } catch {}
  }

  close(): void {
    if (this.stream) this.stream.end()
  }
}
