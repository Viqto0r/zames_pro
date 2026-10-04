import path from 'path'
import fs from 'fs/promises'
import { readdirSync } from 'fs'
import { theme, divider } from './theme.js'
import { translate, DEFAULT_LOCALE, type Locale } from './i18n.js'
import { fileURLToPath } from 'url'

import { ZAMES_HOME } from './config.js'
import type { BrowserLike, ToolArgs, TranscriptLike } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The sources for self-review are .ts files. After the build (tsc → dist/)
// __dirname points to dist, where the .js files live. So we look for the
// source directory: either nearby (running from src/ via tsx), or in ../src
// (running the built dist/ from the repo root).
function resolveSrcDir(): string {
  const candidates = [__dirname, path.join(__dirname, '..', 'src')]
  for (const dir of candidates) {
    try {
      const entries = readdirSync(dir)
      if (entries.some((e: string) => e.endsWith('.ts'))) return dir
    } catch {}
  }
  return __dirname
}

const SRC_DIR = resolveSrcDir()
const SNAP_ROOT = path.join(ZAMES_HOME, 'snapshots')

// Localization for everything the OPERATOR sees. The locale is passed in from
// the caller (src/index.ts holds currentLocale); without it we fall back to the
// default so a direct call never breaks.
function translator(locale?: Locale): ReturnType<typeof translate> {
  return translate(locale || DEFAULT_LOCALE)
}

// Dynamic import of the logic with a timestamp — so that on /reload (or
// auto-reload) self-review uses FRESH tools/agent-loop, not the ones cached on
// first load. Otherwise reload wouldn't reach self-review's dependencies.
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

export async function selfReview({
  browser,
  focus,
  transcript,
  locale,
}: {
  browser: BrowserLike
  focus?: string
  transcript?: TranscriptLike | null
  locale?: Locale
  config?: unknown
}): Promise<{ snapDir: string; reportPath: string; changed: string[] }> {
  const t = translator(locale)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const snapRoot = path.join(SNAP_ROOT)
  const snapDir = path.join(snapRoot, `run-${stamp}`)
  await ensureDir(snapRoot)
  await ensureDir(snapDir)

  const copied = await copyDirJsFiles(SRC_DIR, snapDir)

  if (copied.length === 0) {
    console.error(theme.error('\n✖ ' + t('self.no_src', { dir: SRC_DIR })))
    throw new Error(t('self.no_src_err'))
  }

  // Copy package.json for context — so the agent sees the dependencies
  try {
    const pkg = await fs.readFile(
      path.resolve(SRC_DIR, '..', 'package.json'),
      'utf-8',
    )
    await fs.writeFile(path.join(snapDir, 'package.json'), pkg, 'utf-8')
  } catch {}

  console.log(theme.system('\n' + t('self.snapshot', { dir: snapDir })))
  console.log(
    theme.system(
      t('self.files', { n: copied.length, list: copied.join(', ') }),
    ),
  )
  console.log(theme.system(t('self.starting') + '\n'))

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
      const text = typeof r === 'string' ? r : JSON.stringify(r)
      console.log(
        theme.system(`   → ${text.slice(0, 200).replace(/\n/g, ' ↵ ')}\n`),
      )
    },
    onAssistantMessage: (msg: string) => {
      finalMessage = msg
      console.log(theme.assistant('\n' + t('self.report') + '\n'))
      console.log(msg)
      console.log()
    },
  })

  // Save the report
  const reportPath = path.join(snapDir, '_report.md')
  await fs.writeFile(
    reportPath,
    finalMessage || t('self.report_empty'),
    'utf-8',
  )

  // Compute what changed
  const changed = await diffFiles(SRC_DIR, snapDir)

  console.log(theme.system(divider()))
  console.log(theme.system(t('self.report_path', { v: reportPath })))
  console.log(theme.system(t('self.snapshot_path', { v: snapDir })))
  if (changed.length) {
    console.log(
      theme.assistant(
        t('self.changed', { n: changed.length, list: changed.join(', ') }),
      ),
    )
  } else {
    console.log(theme.system(t('self.changed_none')))
  }
  console.log(theme.user('\n' + t('self.next')))
  console.log(theme.user(t('self.diff_hint', { name: path.basename(snapDir) })))
  console.log(
    theme.user(t('self.apply_hint', { name: path.basename(snapDir) })),
  )
  console.log()

  return { snapDir, reportPath, changed }
}

// ---------- /self-diff ----------

export async function selfDiff({
  name,
  locale,
}: {
  name: string
  locale?: Locale
  config?: unknown
}): Promise<void> {
  const t = translator(locale)
  const snapDir = path.join(SNAP_ROOT, name)
  const snapStat = await fs.stat(snapDir).catch(() => null)
  if (!snapStat) throw new Error(t('self.snapshot_not_found', { dir: snapDir }))

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
    console.log(theme.system(t('self.no_diff')))
  }
}

// ---------- /self-apply ----------

export async function selfApply({
  name,
  locale,
}: {
  name: string
  locale?: Locale
  config?: unknown
}): Promise<void> {
  const t = translator(locale)
  const snapDir = path.join(SNAP_ROOT, name)
  const snapStat = await fs.stat(snapDir).catch(() => null)
  if (!snapStat) throw new Error(t('self.snapshot_not_found', { dir: snapDir }))

  // Back up the current src before overwriting
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(SNAP_ROOT, `backup-before-apply-${stamp}`)
  await copyDirJsFiles(SRC_DIR, backupDir)

  const files = await fs.readdir(snapDir)
  const jsFiles = files.filter((f) => f.endsWith('.ts'))

  if (jsFiles.length === 0) {
    throw new Error(t('self.apply_no_ts', { dir: snapDir }))
  }

  const applied = []
  for (const f of jsFiles) {
    const data = await fs.readFile(path.join(snapDir, f), 'utf-8')
    await fs.writeFile(path.join(SRC_DIR, f), data, 'utf-8')
    applied.push(f)
  }

  console.log(theme.assistant('\n' + t('self.applied', { n: applied.length })))
  console.log(theme.system(applied.join(', ')))
  console.log(theme.system(t('self.backup', { dir: backupDir })))
  console.log(theme.warn('\n' + t('self.restart_hint') + '\n'))
}

// ---------- /self-list ----------

export async function selfList({
  locale,
}: { locale?: Locale; config?: unknown } = {}): Promise<void> {
  const t = translator(locale)
  const snapRoot = path.join(SNAP_ROOT)
  let entries: string[]
  try {
    entries = await fs.readdir(snapRoot)
  } catch {
    console.log(theme.system(t('self.no_snapshots')))
    return
  }

  if (!entries.length) {
    console.log(theme.system(t('self.no_snapshots')))
    return
  }

  entries.sort()
  console.log(theme.system(t('self.list_title')))
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
      ? theme.assistant(t('self.list_changed', { n: changedCount }))
      : theme.system(t('self.list_unchanged'))
    const rep = hasReport ? theme.user('📋') : '  '
    console.log(`  ${rep} ${e}  ${tag}`)
  }
  console.log()
  console.log(theme.system(t('self.list_commands') + '\n'))
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

function buildReviewPrompt({
  focus,
  snapDir,
}: {
  focus?: string
  snapDir: string
}): string {
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

## Found
- (bullet list of issues you found, with file:line if possible)

## Fixed
- (bullet list: file — what exactly you changed)

## Not fixed (deliberately)
- (bullet list: what you left alone and why)

## Verification
- (bullet list: what you verified, e.g. \`node --check\` results)

Be honest and specific. If the code is fine in some area, say so.`
}
