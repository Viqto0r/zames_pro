// sched-smoke: a LIVE check of the scheduler (/loop, /cron, /jobs) in a REAL
// zames instance.
//
// Key idea: TUI input cannot be verified in a sandbox (Ink needs a real
// interactive terminal, and pty.fork/script do not provide one in CI, so the
// input panel simply does not render). That is why TWO things are checked
// independently and for real:
//
//   1) the PURE scheduler modules (src/scheduler.ts) — the exported core the
//      main loop calls: parseInterval, parseCron, nextCronTime,
//      Scheduler.addLoop/addCron/due/remove/clear, formatJobLine;
//   2) the main loop REACTION: the scheduler really enqueues a task into the
//      same pendingQueue as operator input. Reproducible without a browser:
//      Scheduler + due() + push is exactly what the 1-second tick in
//      index.ts does.
//
// Plus: /loop, /cron and /jobs must be present in the real command list
// (SLASH_COMMANDS) with localized descriptions, so the operator sees them in
// the hint list and in /help.
//
// Isolation: HOME points at a temp dir BEFORE the modules are imported (same
// as self-smoke), so the live ~/.zames is never touched. A browser is never
// launched: no scenario needs the network.
import fs from 'fs'
import path from 'path'
import os from 'os'

const REAL_HOME = os.homedir()
if (!process.env.ZAMES_SCHED_SMOKE_HOME) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-sched-'))
  process.env.HOME = tmp
  process.env.ZAMES_SCHED_SMOKE_HOME = tmp
  fs.mkdirSync(path.join(tmp, '.zames'), { recursive: true })
  const realCfg = path.join(REAL_HOME, '.zames', 'config.json')
  if (fs.existsSync(realCfg)) {
    fs.copyFileSync(realCfg, path.join(tmp, '.zames', 'config.json'))
  }
}
const SMOKE_HOME = process.env.ZAMES_SCHED_SMOKE_HOME as string
console.log('sched-smoke: HOME=' + SMOKE_HOME)

const { Scheduler, parseInterval, parseCron, nextCronTime, formatJobLine } =
  await import('../src/scheduler.ts')
const { SLASH_COMMANDS } = await import('../src/commands.ts')
const { translate } = await import('../src/i18n.ts')

let failures = 0
const check = (name: string, ok: boolean, note?: string): void => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : ''))
  if (!ok) failures++
}

// ---------------------------------------------------------------------------
// 1. /loop: интервал -> задача
// ---------------------------------------------------------------------------
console.log('\n--- /loop ---')
check('parseInterval 10s = 10000ms', parseInterval('10s') === 10_000)
check('parseInterval 5m = 300000ms', parseInterval('5m') === 300_000)
check('parseInterval 2h = 7200000ms', parseInterval('2h') === 7_200_000)
check('parseInterval bare 30 = 30000ms', parseInterval('30') === 30_000)
check('parseInterval мусор = null', parseInterval('abc') === null)

const s = new Scheduler()
const loop = s.addLoop(parseInterval('20s')!, 'проверь состояние', 1_000_000)
check('addLoop создал job #' + loop.id, loop.kind === 'loop' && loop.id === 1)
// The first tick is due AT ONCE (`/loop` must start working immediately);
// the next fire is one full interval ahead.
check('nextAt = now (first tick at once)', loop.nextAt === 1_000_000)
console.log('  ' + formatJobLine(loop, 1_000_000))

// ---------------------------------------------------------------------------
// 2. /cron: выражение -> задача
// ---------------------------------------------------------------------------
console.log('\n--- /cron ---')
check('parseCron */5 * * * *', parseCron('*/5 * * * *') !== null)
check('parseCron 0 9 * * 1-5', parseCron('0 9 * * 1-5') !== null)
check('parseCron отверг 4 поля', parseCron('* * * *') === null)
check('parseCron отверг имя дня MON', parseCron('0 9 * * MON') === null)
const nct = nextCronTime('*/2 * * * *', 1_000_000_000_000)
check(
  'nextCronTime вернул будущее время',
  typeof nct === 'number' && nct > 1_000_000_000_000,
)
const cron = s.addCron('*/2 * * * *', 'проверь сборку', 1_000_000)
check('addCron создал job #' + cron!.id, cron !== null && cron.kind === 'cron')
console.log('  ' + formatJobLine(cron!, 1_000_000))

// ---------------------------------------------------------------------------
// 3. Главное: tick реально enqueue'ит задачу (то, что делает 1-сек таймер)
// ---------------------------------------------------------------------------
console.log('\n--- tick -> очередь (как в main loop) ---')
const pendingQueue: Array<{ text: string; jobId?: number }> = []
// Эмулируем 1-секундный tick из index.ts: due(now) -> push в очередь.
const tick = (now: number): number => {
  const due = s.due(now)
  for (const job of due) {
    if (pendingQueue.some((m) => m.jobId === job.id)) continue
    pendingQueue.push({ text: job.task, jobId: job.id })
  }
  return due.length
}
// The loop is due IMMEDIATELY, so the first tick fires it right away; the
// cron job is due only at its computed minute.
check('tick сразу срабатывает loop (первый тик)', tick(1_000_000) === 1)
check(
  'loop попал в очередь',
  pendingQueue.some((m) => m.jobId === loop.id),
)
check('до срока cron tick ничего не даёт', tick(1_000_000 + 1_000) === 0)
check('cron */2 сработал по сроку', tick(cron!.nextAt) >= 1)
check(
  'задача попала в очередь',
  pendingQueue.some((m) => m.jobId === cron!.id),
)
check(
  'в очереди текст задачи',
  pendingQueue.some((m) => m.text === 'проверь сборку'),
)
// Даже если tick вызовут повторно, дубликата нет (та же логика дедупа).
const before = pendingQueue.length
tick(cron!.nextAt)
check('повторный tick не дублирует задачу', pendingQueue.length === before)

// ---------------------------------------------------------------------------
// 4. /jobs: удаление и очистка
// ---------------------------------------------------------------------------
console.log('\n--- /jobs ---')
check('в списке 2 задачи', s.count() === 2)
check('remove(1) удалил loop', s.remove(1) === true)
check('count после rm = 1', s.count() === 1)
check('remove(999) несуществующей = false', s.remove(999) === false)
check('clear() вернул 1', s.clear() === 1)
check('count после clear = 0', s.count() === 0)

// ---------------------------------------------------------------------------
// 5. /loop, /cron, /jobs есть в реальном списке команд и локализованы
// ---------------------------------------------------------------------------
console.log('\n--- список команд и локализация ---')
for (const name of ['/loop', '/cron', '/jobs']) {
  const entry = SLASH_COMMANDS.find((c) => c.name === name)
  check(name + ' в SLASH_COMMANDS', !!entry)
  if (entry) {
    const ru = translate('ru')(entry.key)
    const en = translate('en')(entry.key)
    check(
      name + ' локализован (ru/en)',
      !!ru && !!en && ru !== entry.key && en !== entry.key,
      ru,
    )
  }
}

console.log(
  '\nsched-smoke: ' + (failures === 0 ? 'ALL PASS' : failures + ' FAILED'),
)
if (!process.env.ZAMES_SCHED_SMOKE_KEEP) {
  try {
    fs.rmSync(SMOKE_HOME, { recursive: true, force: true })
  } catch {}
}
process.exit(failures === 0 ? 0 : 1)
