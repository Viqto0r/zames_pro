import fs from 'fs'
import path from 'path'
import type { WriteStream } from 'fs'

export interface TranscriptOptions {
  dir: string
  enabled?: boolean
  sessionName?: string
  /**
   * Optional sink that receives every event as a JSON line, even when the
   * transcript file is disabled. Used by `--output-format jsonl` to stream
   * machine-readable events to stdout for scripts/CI.
   */
  onLine?: ((line: string) => void) | null
}

export class Transcript {
  enabled: boolean
  file: string | null
  stream: WriteStream | null
  startedAt: number
  onLine: ((line: string) => void) | null

  constructor({
    dir,
    enabled = true,
    sessionName = 'session',
    onLine = null,
  }: TranscriptOptions) {
    this.enabled = enabled
    this.file = null
    this.stream = null
    this.startedAt = Date.now()
    this.onLine = onLine

    if (!enabled) return

    try {
      fs.mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      this.file = path.join(dir, `${sessionName}-${stamp}.jsonl`)
      this.stream = fs.createWriteStream(this.file, { flags: 'a' })
      // Write errors (disk full, file deleted, etc.) arrive as an 'error'
      // event; without a listener this is an uncaught exception.
      this.stream.on('error', (e: Error) => {
        console.error(`transcript: write error: ${e.message}`)
        this.enabled = false
      })
    } catch (e) {
      console.error(
        `transcript: failed to create file: ${(e as Error).message}`,
      )
      this.enabled = false
    }
  }

  log(type: string, data: Record<string, unknown> = {}): void {
    const entry = {
      ts: new Date().toISOString(),
      elapsed: Date.now() - this.startedAt,
      type,
      ...data,
    }
    const line = JSON.stringify(entry) + String.fromCharCode(10)
    // The mirror runs even when the file is disabled (jsonl mode).
    if (this.onLine) {
      try {
        this.onLine(line)
      } catch {}
    }
    if (!this.enabled || !this.stream) return
    try {
      this.stream.write(line)
    } catch {}
  }

  close(): void {
    if (this.stream) this.stream.end()
  }
}
