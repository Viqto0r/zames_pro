import path from 'path'
import fs from 'fs/promises'
import { theme } from './theme.js'
import { fileURLToPath } from 'url'

import { ZAMES_HOME } from './config.js'
import type { BrowserLike, ToolArgs, TranscriptLike } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Исходники для самообзора — это .ts файлы. После сборки (tsc → dist/)
// __dirname указывает на dist, где лежат .js. Поэтому ищем каталог с
// исходниками: либо рядом (запуск из src/ через tsx), либо в ../src
// (запуск собранного dist/ из корня репозитория).
function resolveSrcDir(): string {
const candidates = [__dirname, path.join(__dirname, '..', 'src')]
for (const dir of candidates) {
try {
const entries = require('fs').readdirSync(dir)
if (entries.some((e: string) => e.endsWith('.ts'))) return dir
} catch {}
}
return __dirname
}

const SRC_DIR = resolveSrcDir()
const SNAP_ROOT = path.join(ZAMES_HOME, 'snapshots')

// Динамический импорт логики с timestamp — чтобы при /reload (или авто-reload)
// self-review использовал СВЕЖИЕ tools/agent-loop, а не закэшированные при
// первой загрузке. Иначе reload не доходил бы до зависимостей self-review.
async function loadFresh() {
  const stamp = Date.now()
  const toolsUrl = new URL('./tools.js', import.meta.url)
  toolsUrl.searchParams.set('t', String(stamp))
  const loopUrl = new URL('./agent-loop.js', import.meta.url)
  loopUrl.searchParams.set('t', String(stamp))
  const [{ createTools }, { runAgentLoop }] = await Promise.all([
    import(toolsUrl.href),
    import(loopUrl.href),
  ])
  return { createTools, runAgentLoop }
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

async function copyDirJsFiles(from: string, to: string): Promise<string[]> {
  await ensureDir(to)
  const entries = await fs.readdir(from)
  const copied = []
  for (const e of entries) {
    if (!e.endsWith('.ts')) continue
    const data = await fs.readFile(path.join(from, e), 'utf-8')
    await fs.writeFile(path.join(to, e), data, 'utf-8')
    copied.push(e)
  }
  return copied
}


// ---------- /self-review ----------

export async function selfReview({ browser, focus, transcript }: { browser: BrowserLike; focus?: string; transcript?: TranscriptLike | null; config?: unknown }): Promise<{ snapDir: string; reportPath: string; changed: string[] }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const snapRoot = path.join(SNAP_ROOT)
  const snapDir = path.join(snapRoot, `run-${stamp}`)
  await ensureDir(snapRoot)
  await ensureDir(snapDir)

  const copied = await copyDirJsFiles(SRC_DIR, snapDir)

  if (copied.length === 0) {
    console.error(
      theme.error(
        `\n✖ Самообзор отменён: в ${SRC_DIR} нет .ts файлов.\n` +
          `Проверь, что src/ не пуст и ты запускаешь агента из корня проекта.\n`,
      ),
    )
    throw new Error('SRC_DIR пуст — нечего ревьюить')
  }

  // Копируем package.json для контекста — чтобы агент видел зависимости
  try {
    const pkg = await fs.readFile(
      path.resolve(SRC_DIR, '..', 'package.json'),
      'utf-8',
    )
    await fs.writeFile(path.join(snapDir, 'package.json'), pkg, 'utf-8')
  } catch {}

  console.log(theme.system(`\n📸 Снапшот: ${snapDir}`))
  console.log(theme.system(`Файлов: ${copied.length} — ${copied.join(', ')}`))
  console.log(theme.system('Начинаю самообзор...\n'))

  const taskPrompt = buildReviewPrompt({ focus, snapDir })

  const { createTools, runAgentLoop } = await loadFresh()
  const tools = createTools(snapDir, { undo: null })
  let finalMessage = ''

  await runAgentLoop({
    browser,
    tools,
    task: taskPrompt,
    workdir: snapDir,
    maxIterations: 80,
    freshChat: true,
    sendSystemPrompt: true,
    transcript,
    onThinking: () => {},
    onToolCall: (name: string, args: ToolArgs) => {
      const preview = JSON.stringify(args).slice(0, 120)
      console.log(theme.warn(`🔧 ${name}`), theme.system(preview))
    },
    onToolResult: (r: unknown) => {
      const t = typeof r === 'string' ? r : JSON.stringify(r)
      console.log(theme.system(`   → ${t.slice(0, 200).replace(/\n/g, ' ↵ ')}\n`))
    },
    onAssistantMessage: (msg: string) => {
      finalMessage = msg
      console.log(theme.assistant('\n📋 Отчёт:\n'))
      console.log(msg)
      console.log()
    },
  })

  // Сохраняем отчёт
  const reportPath = path.join(snapDir, '_report.md')
  await fs.writeFile(reportPath, finalMessage || '(пусто)', 'utf-8')

  // Считаем, что изменилось
  const changed = await diffFiles(SRC_DIR, snapDir)

  console.log(theme.system('─'.repeat(60)))
  console.log(theme.system(`Отчёт:       ${reportPath}`))
  console.log(theme.system(`Снапшот:     ${snapDir}`))
  if (changed.length) {
    console.log(
      theme.assistant(
        `Изменено:    ${changed.length} файл(ов): ${changed.join(', ')}`,
      ),
    )
  } else {
    console.log(theme.system('Изменено:    (ничего — только отчёт)'))
  }
  console.log(theme.user(`\nДальше:`))
  console.log(
    theme.user(
      `  /self-diff ${path.basename(snapDir)}   — посмотреть различия`,
    ),
  )
  console.log(
    theme.user(
      `  /self-apply ${path.basename(snapDir)}  — применить к живому src/`,
    ),
  )
  console.log()

  return { snapDir, reportPath, changed }
}

// ---------- /self-diff ----------

export async function selfDiff({ name }: { name: string; config?: unknown }): Promise<void> {
  const snapDir = path.join(SNAP_ROOT, name)
  const snapStat = await fs.stat(snapDir).catch(() => null)
  if (!snapStat) throw new Error(`Снапшот не найден: ${snapDir}`)

  const { unifiedDiff, colorDiff } = await import('./diff.js')
  const files = await fs.readdir(snapDir)
  let anyDiff = false

  for (const f of files) {
    if (!f.endsWith('.ts')) continue
    const orig = await fs
      .readFile(path.join(SRC_DIR, f), 'utf-8')
      .catch(() => '')
    const next = await fs
      .readFile(path.join(snapDir, f), 'utf-8')
      .catch(() => '')
    if (orig === next) continue

    anyDiff = true
    console.log(theme.bold(`\n=== src/${f} ===`))
    const diff = unifiedDiff(orig, next, { label: f })
    console.log(colorDiff(diff))
  }

  if (!anyDiff) {
    console.log(theme.system('Различий нет.'))
  }
}

// ---------- /self-apply ----------

export async function selfApply({ name }: { name: string; config?: unknown }): Promise<void> {
  const snapDir = path.join(SNAP_ROOT, name)
  const snapStat = await fs.stat(snapDir).catch(() => null)
  if (!snapStat) throw new Error(`Снапшот не найден: ${snapDir}`)

  // Бэкап текущего src перед перезаписью
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(
    SNAP_ROOT,
    `backup-before-apply-${stamp}`,
  )
  await copyDirJsFiles(SRC_DIR, backupDir)

  const files = await fs.readdir(snapDir)
  const jsFiles = files.filter((f) => f.endsWith('.ts'))

  if (jsFiles.length === 0) {
    throw new Error(
      `В снапшоте ${snapDir} нет .ts файлов. Apply отменён, чтобы не стирать src/.`,
    )
  }

  const applied = []
  for (const f of jsFiles) {
    const data = await fs.readFile(path.join(snapDir, f), 'utf-8')
    await fs.writeFile(path.join(SRC_DIR, f), data, 'utf-8')
    applied.push(f)
  }

  console.log(theme.assistant(`\n✅ Применено: ${applied.length} файл(ов)`))
  console.log(theme.system(applied.join(', ')))
  console.log(theme.system(`Бэкап: ${backupDir}`))
  console.log(
    theme.warn(`\nПерезапусти агента, чтобы изменения вступили в силу.\n`),
  )
}

// ---------- /self-list ----------

export async function selfList({ config }: { config?: unknown } = {}): Promise<void> {
  const snapRoot = path.join(SNAP_ROOT)
  let entries = []
  try {
    entries = await fs.readdir(snapRoot)
  } catch {
    console.log(theme.system('Снапшотов нет.'))
    return
  }

  if (!entries.length) {
    console.log(theme.system('Снапшотов нет.'))
    return
  }

  entries.sort()
  console.log(theme.system('Снапшоты самообзора:'))
  for (const e of entries) {
    const full = path.join(snapRoot, e)
    const stat = await fs.stat(full).catch(() => null)
    if (!stat || !stat.isDirectory()) continue
    const report = path.join(full, '_report.md')
    const hasReport = await fs
      .stat(report)
      .then(() => true)
      .catch(() => false)
    const changedCount = (await diffFiles(SRC_DIR, full)).length
    const tag = changedCount
      ? theme.assistant(`[${changedCount} изменено]`)
      : theme.system('[без правок]')
    const rep = hasReport ? theme.user('📋') : '  '
    console.log(`  ${rep} ${e}  ${tag}`)
  }
  console.log()
  console.log(theme.system('Команды: /self-diff <name>, /self-apply <name>\n'))
}

// ---------- helpers ----------

async function diffFiles(origDir: string, newDir: string): Promise<string[]> {
  const files = await fs.readdir(newDir).catch(() => [])
  const changed = []
  for (const f of files) {
    if (!f.endsWith('.ts')) continue
    const a = await fs.readFile(path.join(origDir, f), 'utf-8').catch(() => '')
    const b = await fs.readFile(path.join(newDir, f), 'utf-8').catch(() => '')
    if (a !== b) changed.push(f)
  }
  return changed
}

function buildReviewPrompt({ focus, snapDir }: { focus?: string; snapDir: string }): string {
  const focusLine = focus
    ? `\nThe user asked you to focus especially on: ${focus}\n`
    : ''

  return `You are a senior JavaScript/Node.js engineer. You are reviewing your own source code — a Playwright-based coding agent that talks to the DeepSeek web chat as an LLM backend.

All source files are in your working directory: ${snapDir}
${focusLine}
## Your job

1. Read EVERY .ts file in your working directory. Use Glob("**/*.ts") to list them, then Read each one. Do not skip files.
2. Identify real, concrete problems. Focus on:
   - Race conditions and async/promise bugs (missing await, unhandled rejections, timing issues)
   - Error handling gaps: places that can throw and crash the agent
   - JSON parsing edge cases in agent-loop.ts (LLM output is unreliable)
   - Fragile DOM selectors in browser.ts (DeepSeek changes layout)
   - Cross-platform issues (Windows paths, cmd.exe vs bash, encoding)
   - Undo/transcript consistency: could undo leave files in bad state?
   - Self-review mode safety: could /self-apply corrupt src/?
   - Anything that breaks state between interactive tasks (chat context, workdir, spinner)
3. Fix what you can fix confidently. Use Edit (small targeted change) or Write (rewrite a file only if really needed). Keep the existing architecture and naming.
4. Do NOT invent problems. If you're not sure, mention it in the report, don't change it.
5. Do NOT touch package.json, node_modules, or files outside the working directory.

## Constraints

- You CANNOT run the agent itself (node_modules is not here). But you CAN use \`node --check <file>\` via Bash to verify syntax after edits.
- Always read a file before editing it.
- After all edits, run \`node --check\` on every file you changed. If any fails, fix the syntax error.

## Report format

When done, respond with a markdown report as the message:

## Найдено
- (bullet list of issues you found, with file:line if possible)

## Исправлено
- (bullet list: file — что именно изменил)

## Не исправлено (осознанно)
- (bullet list: what you left alone and why)

## Проверка
- (bullet list: what you verified, e.g. \`node --check\` results)

Be honest and specific. If the code is fine in some area, say so.`
}
