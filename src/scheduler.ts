// Pure scheduling logic for the /loop and /cron commands. Kept free of any
// browser/terminal dependency so it can be unit-tested; index.ts owns the
// 1-second ticker and the actual enqueue into the message queue.

export interface ScheduleJob {
  id: number
  kind: 'loop' | 'cron'
  task: string
  /** Period for a loop job (ms). Undefined for cron jobs. */
  intervalMs?: number
  /** 5-field cron expression for a cron job. Undefined for loop jobs. */
  cron?: string
  /** Epoch ms of the next fire. */
  nextAt: number
  createdAt: number
}

// Parse a human interval like "30s", "5m", "2h" or a bare number of seconds.
// Returns the period in ms, or null when the text is not a valid interval.
export function parseInterval(text: string): number | null {
  const m =
    /^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hour|hours)?$/i.exec(
      String(text ?? '').trim(),
    )
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = (m[2] || 's').toLowerCase()
  const mult = unit.startsWith('h')
    ? 3_600_000
    : unit.startsWith('m')
      ? 60_000
      : 1000
  return n * mult
}

// Render an interval back to the shortest human form (used in listings).
// Non-finite input (a cron job whose next fire could not be computed sets
// nextAt to Infinity) renders as "-" instead of "Infinityh".
export function formatInterval(ms: number): string {
  if (!Number.isFinite(ms)) return '-'
  if (ms % 3_600_000 === 0) return ms / 3_600_000 + 'h'
  if (ms % 60_000 === 0) return ms / 60_000 + 'm'
  if (ms % 1000 === 0) return ms / 1000 + 's'
  return ms + 'ms'
}

interface CronFields {
  minute: Set<number>
  hour: Set<number>
  dom: Set<number>
  month: Set<number>
  dow: Set<number>
}

// Parse one cron field ("*", "a-b", "*/n", "a,b", "a-b/n") into a value set.
function parseCronField(
  field: string,
  min: number,
  max: number,
): Set<number> | null {
  const out = new Set<number>()
  for (const part of field.split(',')) {
    const [range, stepStr] = part.split('/')
    const step = stepStr === undefined ? 1 : Number(stepStr)
    if (!Number.isInteger(step) || step <= 0) return null
    let lo: number
    let hi: number
    if (range === '*') {
      lo = min
      hi = max
    } else if (range.includes('-')) {
      const [a, b] = range.split('-')
      lo = Number(a)
      hi = Number(b)
    } else {
      lo = Number(range)
      hi = lo
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null
    if (lo < min || hi > max || lo > hi) return null
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out.size ? out : null
}

// Parse a 5-field cron expression: minute hour day-of-month month day-of-week.
// Day-of-week accepts 0-7 (both 0 and 7 mean Sunday). Returns null on a bad
// expression so the command can report it instead of scheduling silently.
export function parseCron(expr: string): CronFields | null {
  const parts = String(expr ?? '')
    .trim()
    .split(/\s+/)
  if (parts.length !== 5) return null
  const minute = parseCronField(parts[0], 0, 59)
  const hour = parseCronField(parts[1], 0, 23)
  const dom = parseCronField(parts[2], 1, 31)
  const month = parseCronField(parts[3], 1, 12)
  const dowRaw = parseCronField(parts[4], 0, 7)
  if (!minute || !hour || !dom || !month || !dowRaw) return null
  const dow = new Set<number>()
  for (const d of dowRaw) dow.add(d === 7 ? 0 : d)
  return { minute, hour, dom, month, dow }
}

// Does the given Date match the cron expression? dom and dow are ANDed (the
// common, predictable behavior); to schedule "every day" use `*` for one.
export function cronMatches(expr: string, date: Date): boolean {
  const c = parseCron(expr)
  if (!c) return false
  return (
    c.minute.has(date.getMinutes()) &&
    c.hour.has(date.getHours()) &&
    c.dom.has(date.getDate()) &&
    c.month.has(date.getMonth() + 1) &&
    c.dow.has(date.getDay())
  )
}

// Next epoch ms at which the expression fires, strictly after `fromMs`. Scans
// minute by minute (bounded to ~4 years); a one-time cost when a job is
// created/rescheduled, and the field checks reject almost every minute fast.
export function nextCronTime(expr: string, fromMs: number): number | null {
  const c = parseCron(expr)
  if (!c) return null
  const d = new Date(fromMs)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1)
  const limit = fromMs + 4 * 366 * 24 * 60 * 60 * 1000
  while (d.getTime() <= limit) {
    if (cronMatches(expr, d)) return d.getTime()
    d.setMinutes(d.getMinutes() + 1)
  }
  return null
}

// One listing line for a job: "#3 [every 10m, next ~5m] run the tests". Pure,
// so the /jobs formatting is unit-tested without a live scheduler.
export function formatJobLine(job: ScheduleJob, now: number): string {
  const when =
    job.kind === 'loop'
      ? 'every ' + formatInterval(job.intervalMs || 0)
      : job.cron || ''
  const nextIn = formatInterval(Math.max(0, job.nextAt - now))
  return '  #' + job.id + ' [' + when + ', next ~' + nextIn + '] ' + job.task
}

// Holds the scheduled jobs. Pure: no timers here. index.ts drives it with a
// 1-second tick and enqueues the tasks that `due()` returns.
export class Scheduler {
  private jobs: ScheduleJob[] = []
  private nextId = 1

  addLoop(intervalMs: number, task: string, now: number): ScheduleJob {
    const job: ScheduleJob = {
      id: this.nextId++,
      kind: 'loop',
      task,
      intervalMs,
      nextAt: now + intervalMs,
      createdAt: now,
    }
    this.jobs.push(job)
    return job
  }

  addCron(cron: string, task: string, now: number): ScheduleJob | null {
    const nextAt = nextCronTime(cron, now)
    if (nextAt === null) return null
    const job: ScheduleJob = {
      id: this.nextId++,
      kind: 'cron',
      task,
      cron,
      nextAt,
      createdAt: now,
    }
    this.jobs.push(job)
    return job
  }

  remove(id: number): boolean {
    const i = this.jobs.findIndex((j) => j.id === id)
    if (i === -1) return false
    this.jobs.splice(i, 1)
    return true
  }

  clear(): number {
    const n = this.jobs.length
    this.jobs = []
    return n
  }

  list(): ScheduleJob[] {
    return this.jobs.slice()
  }

  count(): number {
    return this.jobs.length
  }

  // Jobs whose nextAt is due at `now`, rescheduled for their NEXT fire so a
  // single tick never fires the same job twice. A loop that fell behind is
  // advanced past `now` in one step (missed fires are coalesced, not queued
  // many times).
  due(now: number): ScheduleJob[] {
    const fired: ScheduleJob[] = []
    for (const job of this.jobs) {
      if (job.nextAt > now) continue
      fired.push({ ...job })
      if (job.kind === 'loop' && job.intervalMs && job.intervalMs > 0) {
        const missed = Math.floor((now - job.nextAt) / job.intervalMs)
        job.nextAt = job.nextAt + (missed + 1) * job.intervalMs
      } else if (job.cron) {
        const nxt = nextCronTime(job.cron, now)
        job.nextAt = nxt === null ? Number.POSITIVE_INFINITY : nxt
      }
    }
    return fired
  }
}
