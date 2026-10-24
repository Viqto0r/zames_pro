// Send TELEMETRY — one JSONL line per agent send, per provider.
//
// WHY: the send interval is currently a hand-tuned constant (DeepSeek 15 s,
// Qwen 4 s, GLM 0) and the real limits are only visible in the OUTCOME of a
// send: a rate limit, a busy server, a truncated turn. Recording every send
// with its pause and its outcome turns "what is the limit?" into data instead
// of a guess, and feeds the adaptive throttle (src/send-throttle.ts).
//
// NOTHING about the prompt or the answer is recorded: only timing, the mode
// flags, and the error code/headers a server returned. The file is rotated so
// an unattended run cannot grow it without bound.
//
// The module is PURE apart from the append/rotate helpers, which take the
// directory as an argument (unit-tested with a temp dir).

import fs from 'fs'
import path from 'path'

export type SendOutcome =
  'ok' | 'rate_limit' | 'busy' | 'incomplete' | 'guest_limit'

export interface SendEvent {
  /** ISO timestamp of the send. */
  at: string
  provider: string
  model?: string
  thinking?: boolean
  webSearch?: boolean
  /** The interval the throttle asked for at send time (ms). */
  intervalMs: number
  /** The ACTUAL pause waited since the previous send (ms). */
  waitedMs: number
  outcome: SendOutcome
  /** The server's own words (a short slice), never the prompt. */
  errorText?: string
  /** Retry-After / X-RateLimit-* headers, when the server sent them. */
  retryAfterMs?: number
  /** For a rate limit: how long the block lasted until a success (ms). */
  blockMs?: number
}

/** One line of the telemetry file (PURE). */
export function formatSendEvent(e: SendEvent): string {
  return JSON.stringify(e)
}

/**
 * PURE: parse the raw JSONL text into events, skipping a broken line (a
 * half-written last line is expected after a crash and must not poison the
 * statistics).
 */
export function parseSendEvents(raw: string): SendEvent[] {
  const out: SendEvent[] = []
  for (const line of String(raw || '').split(String.fromCharCode(10))) {
    const t = line.trim()
    if (!t) continue
    try {
      const obj = JSON.parse(t) as SendEvent
      if (obj && typeof obj === 'object' && typeof obj.outcome === 'string') {
        out.push(obj)
      }
    } catch {}
  }
  return out
}

export interface SendStats {
  last10m: number
  last30m: number
  last60m: number
  rateLimits: number
  /** Average duration of a block that was followed by a success (ms). */
  avgBlockMs: number
}

/** PURE: aggregate the last events for the /limits view. */
export function summarizeSends(
  events: SendEvent[],
  now = Date.now(),
): SendStats {
  const within = (ms: number): number =>
    events.filter((e) => {
      const t = Date.parse(e.at)
      // The event must be in the PAST: a future stamp (clock skew on the
      // machine that wrote the log, a hand-edited line) satisfies
      // `now - t <= ms` for EVERY window and inflated all three counters.
      if (!Number.isFinite(t)) return false
      const age = now - t
      return age >= 0 && age <= ms
    }).length
  // `blockMs` may arrive as a NUMBER (the writer) or a string (an older
  // build, a hand-edited file): a numeric string is accepted so the average
  // is not silently 0 for a file that records the block.
  const blocks = events
    // `Number(null)`/`Number(undefined)` — 0/NaN, and 0 IS a finite
    // non-negative number: an event that carries no block duration (the
    // rate-limit event only records `blockedAt`) was averaged as a ZERO-length
    // block, halving the reported average. Only a REAL value counts.
    .map((e) =>
      e.blockMs === null || e.blockMs === undefined ? NaN : Number(e.blockMs),
    )
    .filter((n) => Number.isFinite(n) && n >= 0)
  const avgBlockMs = blocks.length
    ? Math.round(blocks.reduce((a, b) => a + b, 0) / blocks.length)
    : 0
  return {
    last10m: within(10 * 60_000),
    last30m: within(30 * 60_000),
    last60m: within(60 * 60_000),
    rateLimits: events.filter((e) => e.outcome === 'rate_limit').length,
    avgBlockMs,
  }
}

/** `~/.zames/logs/sends-<provider>.jsonl`. The provider id comes from the
 *  CONFIG (a hand-edited file, `/provider`), so it must not be able to escape
 *  the log directory: a separator or `..` used to build a path OUTSIDE
 *  `~/.zames/logs` (a subdirectory at best, another file at worst — and the
 *  rotation DELETES files it finds there). Everything outside a plain file-name
 *  alphabet is replaced with `_`. */
export function sendLogPath(logsDir: string, provider: string): string {
  const safe = String(provider || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_')
  return path.join(logsDir, 'sends-' + safe + '.jsonl')
}

/** Keep at most `keep` sends-*.jsonl files (rotate the oldest away). */
export function rotateSendLogs(logsDir: string, keep = 5): void {
  try {
    const files = fs
      .readdirSync(logsDir)
      .filter((f) => /^sends-.*\.jsonl$/.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(logsDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const old of files.slice(keep)) {
      try {
        fs.unlinkSync(path.join(logsDir, old.f))
      } catch {}
    }
  } catch {}
}

/** Append one event. Best-effort: a logging failure never breaks a send. */
export function appendSendEvent(logsDir: string, e: SendEvent): void {
  try {
    fs.mkdirSync(logsDir, { recursive: true })
    fs.appendFileSync(
      sendLogPath(logsDir, e.provider),
      formatSendEvent(e) + String.fromCharCode(10),
      'utf-8',
    )
  } catch {}
}

/** Read the recent events for one provider (best-effort, [] on failure). */
export function readSendEvents(logsDir: string, provider: string): SendEvent[] {
  try {
    return parseSendEvents(
      fs.readFileSync(sendLogPath(logsDir, provider), 'utf-8'),
    )
  } catch {
    return []
  }
}
