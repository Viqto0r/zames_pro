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
  const ms = n * mult
  // setInterval clamps its delay to a 32-bit signed int (~24.8 days) and Node
  // warns on every tick, while the scheduler computes a fire time the timer
  // can never reach — a huge value is a typo, not a schedule. Reject it here
  // so the operator gets the usage/typo message instead of a silent dead job.
  if (ms > MAX_TIMER_MS) return null
  return ms
}

/** Largest delay setInterval accepts (32-bit signed milliseconds). */
export const MAX_TIMER_MS = 2_147_483_647

// Render an interval back to the shortest human form (used in listings).
// Non-finite input (a cron job whose next fire could not be computed sets
// nextAt to Infinity) renders as "-" instead of "Infinityh".
export function formatInterval(ms: number): string {
  if (!Number.isFinite(ms)) return '-'
  // Zero must stay in SECONDS: `0 % 3_600_000 === 0`, so the hour branch used
  // to render a job that is due NOW as `next ~0h`.
  if (ms === 0) return '0s'
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
  /** True when the day-of-month field is restricted (not `*`). */
  domRestricted: boolean
  /** True when the day-of-week field is restricted (not `*`). */
  dowRestricted: boolean
}

// The DAY rule of standard cron: when BOTH day-of-month and day-of-week are
// restricted they are ORed (`0 9 1 * 1` = the 1st OR any Monday); otherwise
// they are plain ANDed (an unrestricted field matches every day). ANDing a
// restricted pair made the job fire only when the two coincided.
function dayMatches(c: CronFields, date: Date): boolean {
  const domOk = c.dom.has(date.getDate())
  const dowOk = c.dow.has(date.getDay())
  if (c.domRestricted && c.dowRestricted) return domOk || dowOk
  return domOk && dowOk
}

// Parse one cron field ("*", "a-b", "*/n", "a,b", "a-b/n") into a value set.
function parseCronField(
  field: string,
  min: number,
  max: number,
): Set<number> | null {
  const out = new Set<number>()
  for (const part of field.split(',')) {
    // An empty list item (`1,,2`, a trailing comma) used to fall through
    // Number('') === 0 and silently ADD minute 0 to the schedule.
    if (!part) return null
    const [range, stepStr, extra] = part.split('/')
    if (extra !== undefined) return null
    const step = stepStr === undefined ? 1 : Number(stepStr)
    if (!Number.isInteger(step) || step <= 0) return null
    let lo: number
    let hi: number
    if (range === '*') {
      lo = min
      hi = max
    } else if (range.includes('-')) {
      // A bare number is required on BOTH sides: `split('-')` on `-5` gave
      // ['', '5'] and Number('') === 0, so a typo `-5 * * * *` became the
      // range 0-5 instead of being rejected. `1-2-3` was silently truncated
      // to 1-2 the same way.
      const segs = range.split('-')
      if (segs.length !== 2) return null
      const [a, b] = segs
      if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return null
      lo = Number(a)
      hi = Number(b)
    } else {
      if (!/^\d+$/.test(range)) return null
      lo = Number(range)
      // `N/step` (a start with a step, no range) is valid cron: it means from
      // N up to the field maximum. Treating it as the single value N made a
      // normal `5/20 * * * *` expression invalid.
      hi = stepStr === undefined ? lo : max
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
  return {
    minute,
    hour,
    dom,
    month,
    dow,
    domRestricted: parts[2].trim() !== '*',
    dowRestricted: parts[4].trim() !== '*',
  }
}

// Does the given Date match the cron expression? The day rule is standard
// cron: dom/dow are ORed when BOTH are restricted, ANDed otherwise.
export function cronMatches(expr: string, date: Date): boolean {
  const c = parseCron(expr)
  if (!c) return false
  return (
    c.minute.has(date.getMinutes()) &&
    c.hour.has(date.getHours()) &&
    c.month.has(date.getMonth() + 1) &&
    dayMatches(c, date)
  )
}

// Next epoch ms at which the expression fires, strictly after `fromMs`. Scans
// minute by minute (bounded to ~4 years); a one-time cost when a job is
// created/rescheduled, and the field checks reject almost every minute fast.
// The parsed fields are REUSED across the scan: calling cronMatches() re-parsed
// the expression on every minute (millions of parses for a far-future date).
export function nextCronTime(expr: string, fromMs: number): number | null {
  const c = parseCron(expr)
  if (!c) return null
  const d = new Date(fromMs)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1)
  const limit = fromMs + 4 * 366 * 24 * 60 * 60 * 1000
  while (d.getTime() <= limit) {
    if (
      c.minute.has(d.getMinutes()) &&
      c.hour.has(d.getHours()) &&
      c.month.has(d.getMonth() + 1) &&
      dayMatches(c, d)
    ) {
      return d.getTime()
    }
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
  // A cron job whose next fire could not be computed stores Infinity (see
  // due()). "next ~-" (formatInterval maps a non-finite value to '-') read
  // like a normal schedule, so the job looked healthy while it could never
  // fire again.
  if (!Number.isFinite(job.nextAt)) {
    return '  #' + job.id + ' [' + when + ', NEVER fires again] ' + job.task
  }
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
      // The FIRST run is due at once: `/loop 30m <task>` means "start now,
      // then repeat every 30m". Scheduling the first fire one full interval
      // ahead left the operator staring at half an hour of silence right
      // after the command — it read as "the loop did nothing". `due()`
      // reschedules the job a full interval ahead AFTER it fires, so this
      // does not become a busy loop.
      nextAt: now,
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
      } else if (job.kind === 'loop') {
        // A loop with a ZERO/missing interval (a hand-edited or restored job)
        // matched neither branch, so `nextAt` was never advanced and the job
        // fired on EVERY 1-second tick. Never fire it again rather than
        // busy-loop the scheduler.
        job.nextAt = Number.POSITIVE_INFINITY
      } else if (job.cron) {
        const nxt = nextCronTime(job.cron, now)
        job.nextAt = nxt === null ? Number.POSITIVE_INFINITY : nxt
      }
    }
    return fired
  }
}
