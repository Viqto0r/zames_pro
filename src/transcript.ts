import fs from 'fs'
import path from 'path'
import type { WriteStream } from 'fs'

function transcriptErrorLine(e: unknown): string {
  return `transcript: failed to create file: ${(e as Error).message}`
}

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
      // `sessionName` is the LABEL of the working directory (dirLabel), so a
      // name like `a/b` or `C:\x` would nest a subdirectory or break the
      // path outright: the stream then failed with ENOENT and no transcript
      // at all was written. Keep the name a plain file-name fragment.
      const safeName =
        String(sessionName)
          .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
          .trim() || 'session'
      this.file = path.join(dir, `${safeName}-${stamp}.jsonl`)
      this.stream = fs.createWriteStream(this.file, { flags: 'a' })
      // Write errors (disk full, file deleted, etc.) arrive as an 'error'
      // event; without a listener this is an uncaught exception.
      this.stream.on('error', (e: Error) => {
        console.error(`transcript: write error: ${e.message}`)
        this.enabled = false
      })
    } catch (e) {
      console.error(transcriptErrorLine(e))
      this.enabled = false
    }
  }

  /** Number of writes that hit backpressure (write() === false). */
  backpressure = 0

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
      // `write() === false` means the internal buffer is FULL (slow disk /
      // network mount). Node keeps buffering in memory, so a long run of fast
      // events can grow unboundedly; we COUNT the backpressured writes so
      // close() can report them. We still write (dropping trace lines silently
      // would be worse), but the counter makes the condition visible.
      const ok = this.stream.write(line)
      if (!ok) this.backpressure++
    } catch {}
  }

  // Flush the stream and resolve once the data reached the file. The callers
  // run on process.exit paths (one-shot --task, browser error, clean exit), and
  // end() without awaiting the callback lets the process die before the buffer
  // is written — exactly the final events (task result, agent error) one needs
  // for a post-mortem. A no-op promise when there is no stream.
  close(): Promise<void> {
    const stream = this.stream
    this.stream = null
    if (!stream) return Promise.resolve()
    return new Promise((resolve) => {
      // Attach the error handler BEFORE end(): an error emitted synchronously
      // by end() would otherwise reach no listener on this tick.
      stream.on('error', () => resolve())
      stream.end(() => resolve())
    })
  }

  /**
   * A one-line health note for the operator, or null when the stream stayed
   * healthy. Callers print it on exit so a slow/broken transcript file (the
   * events were buffered in memory instead of reaching disk) is not silent.
   */
  healthNote(): string | null {
    if (this.backpressure === 0) return null
    return (
      'transcript: ' +
      this.backpressure +
      ' write(s) hit backpressure (slow disk?)― events may be delayed'
    )
  }
}
