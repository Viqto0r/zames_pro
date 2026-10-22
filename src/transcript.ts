import fs from 'fs'
import path from 'path'
import type { WriteStream } from 'fs'

// A transcript file is appended per RUN and never deleted, so ~/.zames/logs
// grew without bound (177 files / 138 MB observed). On WSL the directory sits
// inside ext4.vhdx: the space of deleted files is not returned to the Windows
// host, so a big log dir is also a host-disk problem. Rotate on start-up: keep
// the newest MAX_TRANSCRIPT_FILES and drop the rest.
const MAX_TRANSCRIPT_FILES = 200

// The constructor is SYNCHRONOUS (it opens the stream right away), so the
// rotation that must happen before the create has to be sync as well.
export function rotateTranscripts(
  dir: string,
  keep = MAX_TRANSCRIPT_FILES,
): number {
  let names: string[]
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl'))
  } catch {
    // A missing/unreadable dir must not break the run: the transcript is
    // created right after and mkdirSync has its own error handling.
    return 0
  }
  if (names.length <= keep) return 0
  // The name is `<sessionName>-<ISO stamp>.jsonl`, and sessionName is the
  // WORKDIR label: one log dir holds several projects, so a plain name sort
  // orders by the LABEL and deletes the newest file of an early-alphabet
  // project (or the CURRENT run's transcript). Order by the STAMP instead,
  // with the name as a tie-break.
  const stampOf = (n: string): string => {
    const m = /(\d{4}-\d{2}-\d{2}T[\d-]+Z)\.jsonl$/.exec(n)
    return m ? m[1] : ''
  }
  names.sort((a, b) => {
    const sa = stampOf(a)
    const sb = stampOf(b)
    if (sa !== sb) return sa < sb ? -1 : 1
    return a < b ? -1 : a > b ? 1 : 0
  })
  let removed = 0
  for (const n of names.slice(0, names.length - keep)) {
    try {
      fs.rmSync(path.join(dir, n), { force: true })
      removed++
    } catch {}
  }
  return removed
}

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

/** Hard cap on one transcript line (a single `log` payload). */
export const TRANSCRIPT_LINE_CAP = 100_000

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
      // Rotation BEFORE the create: the new file then has the newest stamp,
      // so the current run's transcript is never a deletion candidate.
      rotateTranscripts(dir)
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
    let line = JSON.stringify(entry) + String.fromCharCode(10)
    // One `log` call may carry a tool result, a page dump or a fetched
    // document; an uncapped line makes the transcript grow by megabytes per
    // event, and /cost + /export then load it all into memory. Keep the
    // transcript a LOG: cap each line with a marker (never splitting a
    // surrogate pair).
    if (line.length > TRANSCRIPT_LINE_CAP) {
      let cut = TRANSCRIPT_LINE_CAP - 2
      const last = line.charCodeAt(cut - 1)
      if (last >= 0xd800 && last <= 0xdbff) cut--
      line = line.slice(0, cut) + '…' + String.fromCharCode(10)
    }
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
