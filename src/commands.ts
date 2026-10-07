import path from 'path'
import { isImageName } from './attachments.js'
import { translate, type TranslateFn } from './i18n.js'

// Helpers for the extra slash commands (/diff, /cost, /export, /doctor,
// /review, /add-dir). Pure functions, unit-tested without a
// live agent/browser. index.ts only renders their output.

const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)

// ---------- /diff ----------

export function formatDiff(
  diffText: string,
  opts: { maxLines?: number } = {},
  t: TranslateFn = translate('en'),
): string {
  const maxLines = opts.maxLines ?? 200
  const trimmed = String(diffText ?? '')
    .split(CR + NL)
    .join(NL)
    .trimEnd()
  if (!trimmed) return t('diff.no_changes')
  const lines = trimmed.split(NL)
  if (lines.length <= maxLines) return trimmed
  const head = lines.slice(0, maxLines).join(NL)
  const rest = lines.length - maxLines
  return head + NL + t('diff.more_lines', { n: String(rest) })
}

export function diffGitArgs(staged = false): string {
  return staged ? 'git diff --staged' : 'git diff'
}

// ---------- /diffstat ----------

/** Render `git diff --stat` output (a compact change summary) for display. */
export function formatDiffStat(
  statText: string,
  opts: { maxLines?: number } = {},
  t: TranslateFn = translate('en'),
): string {
  const maxLines = opts.maxLines ?? 60
  const trimmed = String(statText ?? '')
    .split(CR + NL)
    .join(NL)
    .trimEnd()
  if (!trimmed || trimmed === '(command produced no output)') {
    return t('diff.no_changes')
  }
  const lines = trimmed.split(NL)
  if (lines.length <= maxLines) return trimmed
  const head = lines.slice(0, maxLines).join(NL)
  return (
    head + NL + t('diff.more_lines', { n: String(lines.length - maxLines) })
  )
}

// ---------- /context ----------

/** One renderable line per loaded context source (file + char count). */
export function formatContextSources(
  agents: Array<{ path: string; content: string }>,
  memory: Array<{ path: string; content: string }>,
  skills: Array<{ name: string; description?: string; path?: string }>,
  commands: Array<{ name: string; description?: string }>,
  opts: { systemPromptChars?: number } = {},
  t: TranslateFn = translate('en'),
): string {
  const lines: string[] = []
  lines.push(t('context.title'))
  if (typeof opts.systemPromptChars === 'number') {
    lines.push(
      t('context.system_prompt', { n: String(opts.systemPromptChars) }),
    )
  }
  const fileLine = (p: string, content: string): string =>
    '  ' + p + '  (' + content.length + ' chars)'
  lines.push(t('context.agents'))
  if (agents.length)
    for (const a of agents) lines.push(fileLine(a.path, a.content))
  else lines.push('  ' + t('context.none'))
  lines.push(t('context.memory'))
  if (memory.length)
    for (const m of memory) lines.push(fileLine(m.path, m.content))
  else lines.push('  ' + t('context.none'))
  lines.push(t('context.skills'))
  if (skills.length)
    for (const s of skills)
      lines.push('  ' + s.name + (s.path ? '  ' + s.path : ''))
  else lines.push('  ' + t('context.none'))
  lines.push(t('context.commands'))
  if (commands.length) for (const c of commands) lines.push('  /' + c.name)
  else lines.push('  ' + t('context.none'))
  return lines.join(NL)
}

// ---------- /cost ----------

export interface TranscriptEntry {
  ts?: string
  elapsed?: number
  type?: string
  tool?: string
  [k: string]: unknown
}

export interface SessionStats {
  turns: number
  toolCalls: number
  toolCounts: Record<string, number>
  /** Total time spent inside tools (sum of tool_result.durationMs), ms. */
  toolMs: number
  /** Per-tool total time in ms, for the top-N breakdown. */
  toolTime: Record<string, number>
  durationMs: number
  startedAt: string | null
  /** How many times the chat was auto-compacted (context neared the limit). */
  autoCompacts: number
}

export function summarizeTranscript(entries: TranscriptEntry[]): SessionStats {
  const stats: SessionStats = {
    turns: 0,
    toolCalls: 0,
    toolCounts: {},
    toolMs: 0,
    toolTime: {},
    durationMs: 0,
    startedAt: null,
    autoCompacts: 0,
  }
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue
    if (e.type === 'user_task') stats.turns++
    if (e.type === 'auto_compact_done') stats.autoCompacts++
    if (e.type === 'tool_call') {
      stats.toolCalls++
      const tool = String(e.tool ?? '?')
      stats.toolCounts[tool] = (stats.toolCounts[tool] || 0) + 1
    }
    if (e.type === 'tool_result') {
      const ms = Number(e.durationMs)
      if (Number.isFinite(ms) && ms > 0) {
        stats.toolMs += ms
        const tool = String(e.tool ?? '?')
        stats.toolTime[tool] = (stats.toolTime[tool] || 0) + ms
      }
    }
    if (typeof e.elapsed === 'number' && e.elapsed > stats.durationMs) {
      stats.durationMs = e.elapsed
    }
    if (!stats.startedAt && typeof e.ts === 'string') stats.startedAt = e.ts
  }
  return stats
}

export function parseTranscript(body: string): TranscriptEntry[] {
  const out: TranscriptEntry[] = []
  for (const line of String(body ?? '').split(NL)) {
    const t = line.trim()
    if (!t) continue
    try {
      const v = JSON.parse(t)
      if (v && typeof v === 'object') out.push(v as TranscriptEntry)
    } catch {
      // skip malformed lines
    }
  }
  return out
}

// Unit labels for a formatted duration. English is the default (used by the
// English /cost output); the user-facing task summary passes localized units
// from the i18n catalog, so a Russian operator reads "1м 20с", not "1m 20s".
export interface DurationUnits {
  h: string
  m: string
  s: string
}

export const EN_DURATION_UNITS: DurationUnits = { h: 'h', m: 'm', s: 's' }

// Human-readable duration: "8s", "5m 12s", "1h 01m 01s". Seconds are padded
// only when a larger unit is present, so a lone "45s" is not "45s" padded.
export function formatDuration(
  ms: number,
  units: DurationUnits = EN_DURATION_UNITS,
): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  if (h > 0)
    return h + units.h + ' ' + pad(m) + units.m + ' ' + pad(s) + units.s
  if (m > 0) return m + units.m + ' ' + pad(s) + units.s
  return s + units.s
}

// Short relative age ("just now", "5m ago", "3h ago", "2d ago") for the
// /sessions and /chats lists. The operator cares about RECENCY, not a raw
// ISO timestamp, when picking a session to restore.
export function formatRelativeTime(
  iso: string | null | undefined,
  t: TranslateFn = translate('en'),
  now = Date.now(),
): string {
  if (!iso) return ''
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const diff = Math.max(0, now - then)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('time.now')
  if (min < 60) return t('time.min_ago', { n: String(min) })
  const hours = Math.floor(min / 60)
  if (hours < 24) return t('time.hour_ago', { n: String(hours) })
  const days = Math.floor(hours / 24)
  return t('time.day_ago', { n: String(days) })
}

export function renderCost(
  stats: SessionStats,
  transcriptFile: string | null,
  tokenUsage: number | null = null,
  t: TranslateFn = translate('en'),
): string {
  const lines: string[] = []
  lines.push(t('cost.title'))
  if (typeof tokenUsage === 'number') {
    lines.push(t('cost.context_known', { n: String(tokenUsage) }))
  } else {
    lines.push(t('cost.context_unknown'))
  }
  lines.push(t('cost.tasks', { n: String(stats.turns) }))
  lines.push(t('cost.tool_calls', { n: String(stats.toolCalls) }))
  if (stats.autoCompacts > 0) {
    lines.push(t('cost.auto_compacts', { n: String(stats.autoCompacts) }))
  }
  const top = Object.entries(stats.toolCounts).sort((a, b) => b[1] - a[1])
  if (top.length) {
    lines.push(t('cost.by_tool'))
    for (const [name, n] of top) lines.push(' ' + name + ': ' + n)
  }
  // T-D3: where the time went. Sort by total ms, show the top tools with the
  // count and a human duration, so Read→Edit cycles and slow Bash calls are
  // visible at a glance.
  const byTime = Object.entries(stats.toolTime || {})
    .filter(([, ms]) => ms > 0)
    .sort((a, b) => b[1] - a[1])
  if (byTime.length) {
    lines.push(t('cost.by_time', { dur: formatDuration(stats.toolMs) }))
    for (const [name, ms] of byTime.slice(0, 8)) {
      const count = stats.toolCounts[name] ?? 0
      lines.push(' ' + name + ': ' + formatDuration(ms) + ' ×' + count)
    }
  }
  lines.push(t('cost.duration', { dur: formatDuration(stats.durationMs) }))
  if (stats.startedAt) lines.push(t('cost.started', { v: stats.startedAt }))
  lines.push(t('cost.transcript', { v: transcriptFile || t('cost.off') }))
  return lines.join(NL)
}

// ---------- /export ----------

export function formatExport(
  entries: TranscriptEntry[],
  meta: { chatId?: string | null; workdir?: string } = {},
): string {
  const out: string[] = []
  out.push('# zames session export')
  out.push('')
  if (meta.workdir) out.push('- workdir: ' + meta.workdir)
  if (meta.chatId) out.push('- chat: ' + meta.chatId)
  out.push('- exported: ' + new Date().toISOString())
  // A self-contained summary, so the exported Markdown stands on its own as a
  // report without opening the transcript or a /cost run.
  const stats = summarizeTranscript(entries)
  out.push('- tasks: ' + stats.turns)
  out.push('- tool calls: ' + stats.toolCalls)
  out.push('- duration: ' + formatDuration(stats.durationMs))
  if (stats.autoCompacts > 0) {
    out.push('- auto-compacts: ' + stats.autoCompacts)
  }
  out.push('')
  for (const e of entries) {
    const type = String(e.type ?? '?')
    if (type === 'user_task') {
      out.push('## Task')
      out.push('')
      out.push(String((e as { task?: unknown }).task ?? ''))
      out.push('')
    } else if (type === 'tool_call') {
      out.push(
        '- tool ' +
          String(e.tool ?? '?') +
          ' ' +
          JSON.stringify((e as { args?: unknown }).args ?? {}),
      )
    } else if (type === 'tool_result') {
      out.push(
        ' -> ' +
          String(e.tool ?? '?') +
          ': ' +
          String((e as { result?: unknown }).result ?? '').slice(0, 500),
      )
    } else if (type === 'assistant_final') {
      out.push('## Answer')
      out.push('')
      out.push(String((e as { message?: unknown }).message ?? ''))
      out.push('')
    }
  }
  return out.join(NL)
}

export function defaultExportPath(workdir: string, now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '')
  return path.join(workdir, 'zames-export-' + stamp + '.md')
}

// ---------- /doctor ----------

export interface DoctorInput {
  nodeVersion: string
  platform: string
  workdir: string
  gitOk: boolean
  gitBranch?: string | null
  configOk: boolean
  configError?: string | null
  browserChannel: string | null
  clipboardTool: string | null
  mcpServers: number
  mcpTools: number
  transcriptOk: boolean
  /** A stored DeepSeek session/credentials exist (auth.json present). */
  authSaved?: boolean
  /** Configured context window (tokens), shown for reference. */
  contextLimit?: number
  /** `git remote` has an `origin` (push/pull possible). */
  hasOrigin?: boolean
  /** Configured minimum pause between agent sends (ms). */
  minSendIntervalMs?: number
  /** Running over an SSH connection (SSH_CONNECTION / SSH_TTY set). */
  sshRemote?: boolean
  /** Headless is the default: is a sanitized (non-Headless) UA cached? A
   *  missing cache means the NEXT headless start does an extra relaunch, and a
   *  broken headless setup shows up here instead of silently failing. */
  headlessUaCached?: boolean
  /** Whether the agent runs headless at all (affects the headless UA row). */
  headless?: boolean
}

export function renderDoctor(
  d: DoctorInput,
  t: TranslateFn = translate('en'),
): string {
  const rows: string[] = []
  const row = (ok: boolean, label: string, value: string): void => {
    rows.push(
      ' ' + (ok ? '[OK] ' : '[WARN]') + ' ' + label.padEnd(16) + ' ' + value,
    )
  }
  const onoff = (b: boolean): string => (b ? t('common.on') : t('common.off'))
  row(true, 'node', d.nodeVersion)
  row(true, 'platform', d.platform)
  row(true, 'workdir', d.workdir)
  row(
    d.gitOk,
    'git',
    d.gitOk
      ? t('doctor.repo', { v: d.gitBranch || t('doctor.detached') })
      : t('doctor.not_repo'),
  )
  row(
    d.configOk,
    'config',
    d.configOk
      ? t('doctor.loaded')
      : t('doctor.error', { v: d.configError || t('doctor.unknown') }),
  )
  row(
    true,
    'browser',
    d.browserChannel ? d.browserChannel : t('doctor.bundled'),
  )
  row(
    !!d.authSaved,
    'auth',
    d.authSaved ? t('doctor.auth_saved') : t('doctor.auth_none'),
  )
  row(
    !!d.clipboardTool,
    'clipboard',
    d.clipboardTool || t('doctor.clipboard_none'),
  )
  row(
    true,
    'mcp',
    t('doctor.mcp', {
      servers: String(d.mcpServers),
      tools: String(d.mcpTools),
    }),
  )
  row(d.transcriptOk, 'transcript', onoff(d.transcriptOk))
  if (typeof d.contextLimit === 'number' && d.contextLimit > 0) {
    row(
      true,
      'context',
      t('doctor.tokens', {
        v: d.contextLimit.toLocaleString('en-US'),
      }),
    )
  }
  if (d.gitOk && typeof d.hasOrigin === 'boolean') {
    row(
      true,
      'git remote',
      d.hasOrigin ? t('doctor.origin_ok') : t('doctor.origin_none'),
    )
  }
  if (typeof d.minSendIntervalMs === 'number') {
    row(
      d.minSendIntervalMs > 0,
      'send pause',
      t('doctor.send_pause', {
        n: String(Math.round(d.minSendIntervalMs / 1000)),
      }),
    )
  }
  if (typeof d.sshRemote === 'boolean') {
    row(true, 'session', d.sshRemote ? t('doctor.ssh') : t('doctor.local'))
  }
  if (d.headless) {
    row(
      !!d.headlessUaCached,
      'headless',
      d.headlessUaCached ? t('doctor.ua_cached') : t('doctor.ua_not_cached'),
    )
  }
  return t('doctor.title') + NL + rows.join(NL)
}

// ---------- /add-dir ----------

export function resolveExtraDir(
  input: string,
  workdir: string,
  t: TranslateFn = translate('en'),
): { path: string } | { error: string } {
  const raw = String(input ?? '').trim()
  if (!raw) return { error: t('adddir.usage') }
  const abs = path.resolve(workdir, raw)
  if (abs === path.resolve(workdir)) {
    return { error: t('adddir.same') }
  }
  return { path: abs }
}

// ---------- restored dialogue ----------

/** One message of a restored chat, as read from the DeepSeek DOM/API. */
export interface RestoredMessage {
  role: 'user' | 'assistant'
  text: string
}

/** How many messages of the dialogue are printed by default. */
export const RESTORED_HISTORY_LIMIT = 20

/**
 * DeepSeek stores the assistant turn VERBATIM: either a raw tool-call JSON
 * ({"tool":"Read","args":{...}}, frequently dirty/truncated) or a `respond`
 * call that carries the real message for the operator
 * ({"tool":"respond","args":{"message":"..."}}). The operator only wants the
 * `respond` message (and plain-text answers) — a tool-call is protocol noise.
 *
 * Returns the tool name and, for `respond`, the unwrapped message. Tolerant on
 * purpose: the stored JSON is often dirty (a stray `}}`, a missing "args"
 * wrapper), so a bare JSON.parse is not enough.
 */
export function parseAssistantToolCall(
  text: string,
): { tool: string; message?: string } | null {
  const t = String(text || '').trim()
  if (!t) return null
  // Broken heads like `<|tool": ...` or `tool": "Bash"` are tolerated.
  const m = t.match(/tool"?\s*:\s*"([^"\s]+)"/)
  if (!m) return null
  const tool = m[1]
  if (tool !== 'respond') return { tool }
  const greedy = t.match(/"message"\s*:\s*"([\s\S]*)"\s*\}*\s*$/)
  let raw = greedy ? greedy[1] : ''
  if (!greedy) {
    const idx = t.indexOf('"message"')
    if (idx >= 0) raw = t.slice(idx + 9).replace(/^\s*:\s*"/, '')
  }
  return { tool, message: unescapeJsonString(raw) }
}

/** Decode the JSON escape sequences that appear inside a captured string. */
export function unescapeJsonString(s: string): string {
  return String(s || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_x, h: string) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\n/g, NL)
    .replace(/\\r/g, String.fromCharCode(13))
    .replace(/\\t/g, String.fromCharCode(9))
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

/**
 * Normalize one restored message for display:
 *  - USER: drop the protocol noise (system-prompt, tool results, nudges) — it
 *    is not the operator's words.
 *  - ASSISTANT: unwrap a `respond` call to its message; drop any other
 *    tool-call (protocol noise); keep plain-text answers.
 * Returns null when the message must not be shown.
 */
export function normalizeRestoredMessage(
  m: RestoredMessage,
): RestoredMessage | null {
  const text = String((m && m.text) || '').trim()
  if (!text) return null
  if (text.length > 100_000) return null // the system-prompt / a giant blob
  if (m.role === 'user') {
    if (/^Tool result for /.test(text)) return null
    if (/^You are a coding agent running in a terminal/.test(text)) return null
    if (/^You stopped after a tool result/.test(text)) return null
    if (/^\[system\]/.test(text)) return null
    if (/^The user ran \//.test(text)) return null
    return { role: 'user', text }
  }
  if (/DSML/i.test(text)) return null
  if (/^<system>/i.test(text)) return null
  // The model sometimes emits its own safety-classification block as a plain
  // "answer"; it is not for the operator.
  if (/<ds_safety>/i.test(text)) return null
  if (/^Safe$/i.test(text)) return null
  const call = parseAssistantToolCall(text)
  if (call) {
    if (call.tool !== 'respond') return null
    const msg = (call.message || '').trim()
    if (!msg) return null
    return { role: 'assistant', text: msg }
  }
  // A plain-text answer (written without the respond wrapper) — show as-is.
  return { role: 'assistant', text }
}

/** Back-compat predicate: is the message worth showing at all? */
export function isDisplayableMessage(m: RestoredMessage): boolean {
  return normalizeRestoredMessage(m) !== null
}

/**
 * Keep only the last `limit` messages, dropping protocol noise and UNWRAPPING
 * the assistant `respond` calls to their operator-facing text.
 */
export function trimRestoredMessages(
  messages: RestoredMessage[],
  limit = RESTORED_HISTORY_LIMIT,
): RestoredMessage[] {
  const clean: RestoredMessage[] = []
  for (const m of messages || []) {
    if (!m || typeof m.text !== 'string') continue
    const n = normalizeRestoredMessage(m)
    if (n) clean.push(n)
  }
  if (limit > 0 && clean.length > limit)
    return clean.slice(clean.length - limit)
  return clean
}

/**
 * Render the restored dialogue as plain text lines: "❯ ..." for the operator,
 * "● ..." for the agent. Markdown rendering is done by the caller (it needs
 * the terminal width); this helper is pure and unit-tested.
 */
export function formatRestoredHistory(
  messages: RestoredMessage[],
  opts: { limit?: number } = {},
): string {
  const list = trimRestoredMessages(
    messages,
    opts.limit ?? RESTORED_HISTORY_LIMIT,
  )
  const out: string[] = []
  for (const m of list) {
    const marker = m.role === 'user' ? '❯ ' : '● '
    out.push(marker + m.text.trim())
  }
  return out.join(NL + NL)
}
// ---------- /compact ----------

/**
 * The prompt that asks the model to compress the current chat into a handover
 * summary. It is sent to the OLD chat before a new one is opened; the answer
 * (the summary) is then carried over as the context of the new chat.
 *
 * The summary must be self-sufficient: the new chat sees ONLY this text (plus
 * the system prompt), so the model is told to keep facts, decisions, file
 * paths, commands and the exact current state of the work.
 */
export function buildCompactPrompt(locale: 'ru' | 'en' = 'ru'): string {
  if (locale === 'en') {
    return (
      'Compact the conversation so far into a handover summary for a NEW chat. ' +
      'This summary is the ONLY context the new chat will start with, so it must be self-sufficient. ' +
      'Include: (1) the user goal and constraints; (2) what has been done so far; ' +
      '(3) the exact current state (files changed, commands run, their results); ' +
      '(4) open questions and the next concrete steps. ' +
      'Keep file paths, function/identifier names, commands and error texts verbatim. ' +
      'Be concise but complete — no small talk, no code dumps beyond short essential snippets. ' +
      'Reply with the summary text ONLY. Do NOT call any tools and do NOT output tool-call ' +
      'JSON or DSML — this is a handover summary, not a continuation of the work.'
    )
  }
  return (
    'Сожми историю диалога в краткое резюме для НОВОГО чата. ' +
    'Это резюме будет ЕДИНСТВЕННЫМ контекстом, с которым новый чат начнёт работу, поэтому оно должно быть самодостаточным. ' +
    'Включи: (1) цель пользователя и ограничения; (2) что уже сделано; ' +
    '(3) точное текущее состояние (изменённые файлы, выполненные команды и их результаты); ' +
    '(4) открытые вопросы и следующие конкретные шаги. ' +
    'Пути к файлам, имена функций/идентификаторов, команды и тексты ошибок сохраняй дословно. ' +
    'Пиши кратко, но полно — без воды и без больших дампов кода (только короткие важные фрагменты). ' +
    'В ответе верни ТОЛЬКО текст резюме. НЕ вызывай инструменты и НЕ выводи JSON/DSML вызова ' +
    'инструмента — это резюме для передачи, а не продолжение работы.'
  )
}

/**
 * Is the model's /compact answer a usable handover summary?
 *
 * The summary request is sent into the OLD chat as a normal turn, so in
 * reasoning mode the model can answer it with a TOOL CALL instead of prose
 * (observed live: it emitted a Bash call to "gather the current state" and
 * never produced a summary — only a THINK fragment). A tool-call JSON is
 * protocol noise and must NOT be carried into the new chat, otherwise the new
 * chat starts by re-running an old command. An empty answer / the abort
 * sentinel is unusable too.
 */
export function isUsableCompactSummary(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  if (t.length < 40) return false
  if (/^\(прервано пользователем\)$/.test(t)) return false
  if (parseAssistantToolCall(t)) return false
  if (/DSML/i.test(t)) return false
  // A tool-call body without a recognizable head (a cut-off stream) still
  // carries "args": { ... }.
  if (/"args"\s*:\s*\{/.test(t)) return false
  if (/<ds_safety>/i.test(t)) return false
  return true
}

/**
 * Wrap the model's summary into the text posted as the first message of the
 * NEW chat. The system prompt is sent separately (sendSystemPrompt), so here
 * we only mark the block as a carried-over context and add the operator's
 * original goal so the model does not lose it.
 */
export function buildCompactCarryover(summary: string, task?: string): string {
  const body = String(summary ?? '').trim()
  const goal = String(task ?? '').trim()
  let out =
    'Context carried over from a previous chat (compacted). ' +
    'Treat it as the history of our work so far and continue from the current state.'
  out += NL + NL + body
  if (goal) {
    out += NL + NL + 'Original task: ' + goal
  }
  return out
}

// ---------- /review ----------

// ---------- Ctrl+C escalation ----------

// Decide what a Ctrl+C does while the agent is busy. The FIRST press aborts
// the currently running TOOL; a SECOND press within the window stops the WHOLE
// run (including the queue). Outside the window it is a fresh first press.
// Returns 'tool' | 'run'.
export function ctrlCEscalation(
  sinceLastMs: number,
  windowMs = 2000,
): 'tool' | 'run' {
  return sinceLastMs < windowMs ? 'run' : 'tool'
}

// ---------- queued messages (batch merge) ----------

// A message typed while the agent works lands in the pending queue. Sending
// each one separately costs N rate-limit pauses and splits the operator's
// thought; merging the leading PLAIN-TEXT messages into ONE batch is both
// faster and closer to intent. Slash-commands are NOT merged — they must be
// handled by the main loop, not sent to the model as a task.

export interface QueuedAttachment {
  path: string
  name: string
  mime: string
}

export interface QueuedMessage {
  text: string
  attachments?: QueuedAttachment[]
}

export interface MergedMessage {
  text: string
  attachments: QueuedAttachment[]
}

// True when a scheduled job already has a message waiting in the queue. The
// scheduler ticker uses this to avoid piling many copies of the SAME job while
// the agent is busy (a 1-minute loop would otherwise queue a task every minute
// during one long task, and they would all run back-to-back). Pure, so the
// guard is unit-tested without a live scheduler.
export function hasQueuedJob(
  queue: Array<{ jobId?: number }>,
  jobId: number,
): boolean {
  return queue.some((m) => m.jobId === jobId)
}

// True when the queued message is a slash-command. It must NOT be merged into
// a task: the main loop has to execute it (e.g. /compact, /new).
export function isSlashCommand(text: string): boolean {
  const s = String(text ?? '').trim()
  // `!command` is also an operator command (run the shell directly) — it
  // must NOT be batched into a task sent to the model.
  return s.startsWith('/') || s.startsWith('!')
}

// Parse a live toggle command that can be applied IMMEDIATELY while the agent
// is busy (no send needed): `/thinking [on|off]` and `/web [on|off]` (aliases
// `/search`, `/websearch`). Returns null when the text is not such a command,
// so the caller can fall through to the normal handling. Kept pure so the
// interception in the input handler and the main loop share the same parsing.
export interface LiveToggleCommand {
  kind: 'thinking' | 'search'
  mode: 'on' | 'off' | 'toggle'
}

export function parseLiveToggle(text: string): LiveToggleCommand | null {
  const m = /^\/(thinking|web|websearch|search)(?:\s+(\S+))?\s*$/i.exec(
    String(text ?? '').trim(),
  )
  if (!m) return null
  const name = m[1].toLowerCase()
  const kind: 'thinking' | 'search' =
    name === 'thinking' ? 'thinking' : 'search'
  const arg = (m[2] || '').toLowerCase()
  let mode: 'on' | 'off' | 'toggle' = 'toggle'
  if (arg === 'on' || arg === '1' || arg === 'true' || arg === 'вкл')
    mode = 'on'
  else if (arg === 'off' || arg === '0' || arg === 'false' || arg === 'выкл')
    mode = 'off'
  else if (arg !== '') return null
  return { kind, mode }
}

// Prepend a long-lived session goal to a task message, so the model keeps the
// big picture even when the goal was set many turns ago. The task is appended
// AFTER the goal; when there is no goal the task is returned unchanged. The
// text is agent-facing (English), like the system prompt.
export function withGoal(
  goal: string | null | undefined,
  task: string,
): string {
  const g = String(goal ?? '').trim()
  if (!g) return task
  const NL = String.fromCharCode(10)
  return (
    'Session goal (long-lived — keep it in mind for this and every following task):' +
    NL +
    g +
    NL +
    NL +
    'Current task:' +
    NL +
    task
  )
}

// Parse a `/goal` invocation. Subcommands: 'set' (with text), 'show', 'clear'.
// Returns null when the text is not a /goal command. Kept pure so the main loop
// and any future interception share one parser.
export function parseGoalCommand(
  text: string,
): { sub: 'show' } | { sub: 'clear' } | { sub: 'set'; goal: string } | null {
  const t = String(text ?? '').trim()
  const m = /^\/goal(?:\s+([\s\S]*))?$/.exec(t)
  if (!m) return null
  const rest = (m[1] ?? '').trim()
  if (rest === '') return { sub: 'show' }
  if (rest.toLowerCase() === 'clear' || rest.toLowerCase() === 'off')
    return { sub: 'clear' }
  return { sub: 'set', goal: rest }
}

// Replace [image#N] / [file#N] markers in a task with the REAL file path, so
// the model (reading the message in the DeepSeek chat) gets a usable path
// instead of a bare marker. The terminal keeps showing the compact markers;
// only the text sent to the browser is expanded. Numbering must match
// AttachmentStore.add(): images and files are counted SEPARATELY, in the order
// the attachments were added. A marker with no matching attachment is left
// as-is (never silently dropped). Pure, so it is unit-tested.
export function substituteAttachmentMarkers(
  text: string,
  attachments: Array<{ path: string; name: string; mime?: string }>,
): string {
  let imageCount = 0
  let fileCount = 0
  const imagePath = new Map<number, string>()
  const filePath = new Map<number, string>()
  for (const a of attachments || []) {
    const isImg =
      String(a.mime || '').startsWith('image/') || isImageName(a.name)
    if (isImg) imagePath.set(++imageCount, a.path)
    else filePath.set(++fileCount, a.path)
  }
  let out = String(text ?? '')
  out = out.replace(
    /\[image#(\d+)\]/g,
    (whole, n) => imagePath.get(Number(n)) ?? whole,
  )
  out = out.replace(
    /\[file#(\d+)\]/g,
    (whole, n) => filePath.get(Number(n)) ?? whole,
  )
  return out
}

// Rewrite the paths of files that FAILED to attach into [attach-failed: name]
// in the task text, so the model does not believe an unavailable file was
// attached. The prompt carries real paths (substituteAttachmentMarkers), so a
// failed file's path is replaced in place. Pure, so it is unit-tested.
export function rewriteFailedAttachments(
  text: string,
  failed: Array<{ path: string; name: string }>,
): string {
  let out = String(text ?? '')
  for (const f of failed || []) {
    if (!f || !f.path) continue
    out = out.split(f.path).join('[attach-failed: ' + f.name + ']')
  }
  return out
}

// Split a custom-command argument string into positional tokens, honoring
// single/double quotes (so two quoted words stay one token). Pure, so it is
// unit-tested.
export function splitCommandArgs(rest: string): string[] {
  const out: string[] = []
  const s = String(rest ?? '')
  const SQ = String.fromCharCode(39)
  const DQ = String.fromCharCode(34)
  let cur = ''
  let quote = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quote) {
      if (ch === quote) {
        quote = ''
        continue
      }
      cur += ch
      continue
    }
    if (ch === SQ || ch === DQ) {
      quote = ch
      continue
    }
    if (ch.charCodeAt(0) <= 32) {
      if (cur) {
        out.push(cur)
        cur = ''
      }
      continue
    }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}

function isAllDigits(tok: string): boolean {
  if (!tok) return false
  for (let i = 0; i < tok.length; i++) {
    const c = tok.charCodeAt(i)
    if (c < 48 || c > 57) return false
  }
  return true
}

function isWordChar(ch: string): boolean {
  const c = ch.charCodeAt(0)
  return (
    (c >= 48 && c <= 57) ||
    (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) ||
    ch === '_'
  )
}

// Replace $1..$N and $name tokens in an already-expanded body. A whole word is
// read after $ so $foobar never matches the name foo. Pure.
function replaceDollarTokens(
  s: string,
  parts: string[],
  names: string[],
): string {
  let res = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch !== '$') {
      res += ch
      i++
      continue
    }
    let j = i + 1
    let tok = ''
    while (j < s.length && isWordChar(s[j])) {
      tok += s[j]
      j++
    }
    if (!tok) {
      res += ch
      i++
      continue
    }
    if (isAllDigits(tok)) {
      res += parts[Number(tok) - 1] ?? ''
    } else {
      const idx = names.indexOf(tok)
      res += idx >= 0 ? (parts[idx] ?? '') : '$' + tok
    }
    i = j
  }
  return res
}

// Expand a custom-command body: {{args}} / $ARGUMENTS become the whole argument
// string, $1..$N the positional tokens, $name the declared positions. Pure, so
// it is unit-tested.
export function expandCommandArgs(
  body: string,
  rest: string,
  names: string[] = [],
): string {
  const parts = splitCommandArgs(rest)
  let out = String(body ?? '')
  out = out.split('{{args}}').join(rest)
  out = out.split('$ARGUMENTS').join(rest)
  out = replaceDollarTokens(out, parts, names)
  return out.trim()
}

// Names declared in `arguments:` but not supplied on the command line (by
// position). Pure, so the caller can refuse an incomplete invocation.
export function missingCommandArgs(
  names: string[] | undefined,
  rest: string,
): string[] {
  if (!names || !names.length) return []
  const parts = splitCommandArgs(rest)
  const missing: string[] = []
  for (let i = 0; i < names.length; i++) {
    if (!parts[i]) missing.push(names[i])
  }
  return missing
}

// True when a `/config ...` line can be handled LIVE (while the agent is busy):
// the text subcommands only touch config values, never the chat. The bare
// `/config` and `/config menu` (which pause the editor and read keys) are NOT
// live — they must go through the main loop, so a mid-run menu never fights
// the running task. Pure, so the interception is unit-tested.
export function isLiveConfigCommand(text: string): boolean {
  return /^\/config\s+(?!menu\b|ui\b)\S+/i.test(String(text ?? '').trim())
}

// Parse a `/queue` invocation. Returns the subcommand ('list' | 'clear') or
// null when the text is not a /queue command at all. This runs WHILE the agent
// is busy (intercepted in the input handler), because the main command loop is
// blocked on runTask() and a queued /queue would only run after the task —
// when inspecting/clearing the queue is pointless.
export function parseQueueCommand(
  text: string,
): { sub: 'list' | 'clear' } | null {
  const t = String(text ?? '').trim()
  const m = /^\/queue(?:\s+(\S+))?\s*$/.exec(t)
  if (!m) return null
  const arg = (m[1] || '').toLowerCase()
  if (arg === '' || arg === 'list' || arg === 'ls') return { sub: 'list' }
  if (arg === 'clear' || arg === 'c' || arg === 'clean') return { sub: 'clear' }
  // An unrecognized subcommand falls through to the normal main-loop handler,
  // which prints the usage hint.
  return null
}

// Render the queued messages for the operator (one line per message, text
// truncated). Pure, so the /queue interception and the main-loop handler share
// the EXACT same output instead of duplicating the formatting.
export function formatQueueList(msgs: QueuedMessage[]): string[] {
  return (msgs || []).map((m, i) => {
    const one = String(m.text || '')
      .replace(/\s+/g, ' ')
      .trim()
    const shown = one.length > 80 ? one.slice(0, 80) + ' …' : one
    const att = m.attachments?.length ? ' [+' + m.attachments.length + ']' : ''
    return '  ' + (i + 1) + '. ' + shown + att
  })
}

function queuedIsImage(a: QueuedAttachment): boolean {
  return (
    String(a.mime || '').startsWith('image/') ||
    isImageName(String(a.name || ''))
  )
}

// Merge a batch of queued messages into a single task. Marker numbering is
// PER-MESSAGE ([image#1]/[file#1] restart in every message), so a naive
// concatenation would produce duplicate markers for different files. We
// RENUMBER the markers across the batch and rebuild the attachments array in
// the same order, keeping the text markers the source of truth.
export function mergeMessages(msgs: QueuedMessage[]): MergedMessage {
  const list = (msgs || []).filter((m) => String(m?.text ?? '').trim() !== '')
  if (list.length === 0) return { text: '', attachments: [] }
  if (list.length === 1) {
    return {
      text: list[0].text,
      attachments: (list[0].attachments || []).slice(),
    }
  }
  let imgOffset = 0
  let fileOffset = 0
  const attachments: QueuedAttachment[] = []
  const parts: string[] = []
  for (const m of list) {
    const atts = m.attachments || []
    const images = atts.filter(queuedIsImage)
    const files = atts.filter((a) => !queuedIsImage(a))
    let text = String(m.text)
    text = text.replace(/\[image#(\d+)\]/g, (whole, n) => {
      const i = Number(n)
      if (!Number.isFinite(i) || i < 1 || i > images.length) return whole
      return '[image#' + (imgOffset + i) + ']'
    })
    text = text.replace(/\[file#(\d+)\]/g, (whole, n) => {
      const i = Number(n)
      if (!Number.isFinite(i) || i < 1 || i > files.length) return whole
      return '[file#' + (fileOffset + i) + ']'
    })
    imgOffset += images.length
    fileOffset += files.length
    attachments.push(...atts)
    parts.push(text.trim())
  }
  const header =
    'The operator sent ' +
    list.length +
    ' messages while you were working. They are listed below in order — ' +
    'treat them as one instruction.'
  const text = header + NL + NL + parts.join(NL + NL + '---' + NL + NL)
  return { text, attachments }
}

// ---------- /improve ----------

// A single actionable BACKLOG item parsed from BACKLOG.md.
export interface BacklogItem {
  id: string
  title: string
  status: 'done' | 'open'
  priority: string
  /** Path to read, if the item mentions one (e.g. src/commands.ts). */
}

// Parse BACKLOG.md into actionable items. Recognizes headings of the form
// `### A1. ...`, `### D7. ...` and marks an item done when its heading carries
// a `[x]` marker. Pure; unit-tested. We deliberately do NOT parse the whole
// markdown structure — only the headings the file contract promises.
export function parseBacklogItems(text: string): BacklogItem[] {
  const out: BacklogItem[] = []
  let priority = ''
  for (const raw of String(text ?? '').split(NL)) {
    const line = raw.trimEnd()
    const p = /^##\s+(P[0-3])\b/.exec(line)
    if (p) {
      priority = p[1]
      continue
    }
    const m = /^###\s+([A-Z]\d+)\.\s+(.*)$/.exec(line)
    if (!m) continue
    const id = m[1]
    const rest = m[2]
    // The `[x]` rewrite in BACKLOG keeps the ORIGINAL heading under a
    // <details> block wrapped in `~~`. That archived copy must not be counted
    // as a second, open item — skip a heading whose text starts with `~~`.
    if (rest.trim().startsWith('~~')) continue
    const done = /^\[x\]/i.test(rest.trim())
    // The title is the heading text with the [x] marker and the `~~` strike
    // wrappers removed, so a done item still has a clean label.
    const title = rest
      .replace(/^\[x\]\s*/i, '')
      .replace(/~~/g, '')
      .trim()
    out.push({ id, title, status: done ? 'done' : 'open', priority })
  }
  return out
}

// The next item to work on: the highest-priority OPEN item, in file order.
// P0 first, then P1..P3. An explicit id overrides the priority search.
export function nextBacklogItem(
  items: BacklogItem[],
  wanted?: string,
): BacklogItem | null {
  const open = items.filter((i) => i.status === 'open')
  if (wanted) {
    const w = wanted.trim().toUpperCase()
    return items.find((i) => i.id.toUpperCase() === w) || null
  }
  if (!open.length) return null
  const rank = (p: string): number => {
    const m = /P(\d)/.exec(p || '')
    return m ? Number(m[1]) : 9
  }
  return open.slice().sort((a, b) => rank(a.priority) - rank(b.priority))[0]
}

// The task text sent to the agent for a chosen item. Agent-facing English,
// like the rest of the loop. Keeps the working rules explicit so a fresh agent
// does not need any external context.
export function buildImprovePrompt(item: BacklogItem): string {
  return (
    'Implement BACKLOG item ' +
    item.id +
    ' (priority ' +
    (item.priority || '?') +
    '): ' +
    item.title +
    NL +
    NL +
    'Read the full item text in BACKLOG.md for the details and the rationale. ' +
    'Then: (1) implement it with the smallest reasonable change; ' +
    '(2) run `npm run typecheck`, `npm run lint`, `npm run format:check` and ' +
    '`npm test` and fix any failure; (3) mark the item done in BACKLOG.md by ' +
    'prefixing its heading with `[x]` and wrapping the original heading text ' +
    'in `~~ ~~`; (4) add a CHANGELOG entry if the change is user-visible; ' +
    '(5) do NOT commit or push — leave the changes staged in the working tree ' +
    'for the operator to review. When done, call respond with a short report ' +
    '(files changed, tests run, whether BACKLOG/CHANGELOG were updated).'
  )
}

// ---------- /review ----------

// Commands that only make sense while developing zames itself. A regular user
// who installed the package must not see them in /help or the «/» hints, and
// the main loop rejects them unless dev mode is on (--dev / config.hotReload).
// Kept here (pure) so the list has ONE source of truth and is unit-tested.
export const DEV_ONLY_COMMANDS = [
  '/improve',
  '/backlog',
  '/self-review',
  '/self-fix',
  '/self-done',
  '/self-list',
  '/self-diff',
  '/self-apply',
]

/** True when the typed line invokes a dev-only command. */
export function isDevOnlyCommand(text: string): string | null {
  const name = String(text ?? '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
  return DEV_ONLY_COMMANDS.find((c) => c === name) || null
}

export function buildReviewPrompt(focus: string, hasStaged = false): string {
  const scope = hasStaged ? 'staged' : 'uncommitted'
  const f = String(focus ?? '').trim()
  let s =
    'Review the ' +
    scope +
    ' changes in this repository (use GitDiff). ' +
    'Focus on real bugs: correctness, race conditions, error handling, ' +
    'security, and missing tests. Do NOT invent problems and do NOT change ' +
    'code: only report findings with file:line and a short rationale.'
  if (f) s += NL + 'Extra focus: ' + f
  return s
}

// ---------- slash-command hints ----------

// A built-in slash command: the name plus the i18n key of its description.
// Kept as DATA here (pure) so both the «/» completion list and /help have ONE
// source of truth; the description is localized at display time via `t`.
export interface SlashCommandEntry {
  name: string
  key: string
}

// The canonical list. Dev-only entries are filtered by buildSlashCommandHints()
// unless dev mode is on (DEV_ONLY_COMMANDS above), so a regular install never
// advertises them.
export const SLASH_COMMANDS: SlashCommandEntry[] = [
  { name: '/help', key: 'help.cmd.help' },
  { name: '/new', key: 'help.cmd.new' },
  { name: '/clear', key: 'help.cmd.new' },
  { name: '/sessions', key: 'help.cmd.sessions' },
  { name: '/chats', key: 'help.cmd.chats' },
  { name: '/resume', key: 'help.cmd.resume' },
  { name: '/resume-id', key: 'help.cmd.resume_id' },
  { name: '/last', key: 'help.cmd.last' },
  { name: '/retry', key: 'help.cmd.retry' },
  { name: '/rename', key: 'help.cmd.rename' },
  { name: '/context', key: 'help.cmd.context' },
  { name: '/copy', key: 'help.cmd.copy' },
  { name: '/chat', key: 'help.cmd.chat' },
  { name: '/cd', key: 'help.cmd.cd' },
  { name: '/pwd', key: 'help.cmd.pwd' },
  { name: '/status', key: 'help.cmd.status' },
  { name: '/reload', key: 'help.cmd.reload' },
  { name: '/undo', key: 'help.cmd.undo' },
  { name: '/undo-list', key: 'help.cmd.undo_list' },
  { name: '/rewind', key: 'help.cmd.rewind' },
  { name: '/rewind-list', key: 'help.cmd.rewind_list' },
  { name: '/transcript', key: 'help.cmd.transcript' },
  { name: '/diff', key: 'help.cmd.diff' },
  { name: '/diffstat', key: 'help.cmd.diffstat' },
  { name: '/cost', key: 'help.cmd.cost' },
  { name: '/export', key: 'help.cmd.export' },
  { name: '/doctor', key: 'help.cmd.doctor' },
  { name: '/add-dir', key: 'help.cmd.add_dir' },
  { name: '/review', key: 'help.cmd.review' },
  { name: '/improve', key: 'help.cmd.improve' },
  { name: '/backlog', key: 'help.cmd.backlog' },
  { name: '/goal', key: 'help.cmd.goal' },
  { name: '/loop', key: 'help.cmd.loop' },
  { name: '/cron', key: 'help.cmd.cron' },
  { name: '/jobs', key: 'help.cmd.jobs' },
  { name: '/thinking', key: 'help.cmd.thinking' },
  { name: '/web', key: 'help.cmd.web' },
  { name: '/plan', key: 'help.cmd.plan' },
  { name: '/compact', key: 'help.cmd.compact' },
  { name: '/queue', key: 'help.cmd.queue' },
  { name: '/tasks', key: 'help.cmd.tasks' },
  { name: '/config', key: 'help.cmd.config' },
  { name: '/skills', key: 'help.cmd.skills' },
  { name: '/memory', key: 'help.cmd.memory' },
  { name: '/remember', key: 'help.cmd.remember' },
  { name: '/init', key: 'help.cmd.init' },
  { name: '/mcp', key: 'help.cmd.mcp' },
  { name: '/debug-dom', key: 'help.cmd.debug_dom' },
  { name: '/self-review', key: 'help.self.review' },
  { name: '/self-fix', key: 'help.self.fix' },
  { name: '/self-done', key: 'help.self.done' },
  { name: '/self-list', key: 'help.self.list' },
  { name: '/self-diff', key: 'help.self.diff' },
  { name: '/self-apply', key: 'help.self.apply' },
  { name: '/exit', key: 'help.cmd.exit' },
  { name: '/quit', key: 'help.cmd.exit' },
]

// A ready-to-display hint (name + localized description, optional argument
// hint) — the shape LineEditor.setCommands() expects.
export interface SlashHint {
  name: string
  description: string
  hint?: string
}

// Build the localized hint list from the built-in table plus the dynamic
// skills/custom commands discovered for the current workdir. PURE: the caller
// passes `t` and the data; nothing here touches the terminal or the editor.
// Dev-only commands are dropped unless `devMode`; a dynamic entry whose name
// clashes with a built-in (case-insensitive) is skipped, so a skill cannot
// shadow /help.
export function buildSlashCommandHints(opts: {
  devMode: boolean
  t: TranslateFn
  commands?: SlashCommandEntry[]
  dynamic?: SlashHint[]
}): SlashHint[] {
  const { devMode, t } = opts
  const table = opts.commands ?? SLASH_COMMANDS
  const base: SlashHint[] = table
    .filter((c) => devMode || !isDevOnlyCommand(c.name))
    .map((c) => ({ name: c.name, description: t(c.key) }))
  const known = new Set(base.map((c) => c.name.toLowerCase()))
  for (const d of opts.dynamic ?? []) {
    if (known.has(d.name.toLowerCase())) continue
    base.push(d)
  }
  return base
}
