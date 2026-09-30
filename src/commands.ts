import path from 'path'
import { isImageName } from './attachments.js'

// Helpers for the extra slash commands (/diff, /cost, /export, /doctor,
// /permissions, /review, /add-dir). Pure functions, unit-tested without a
// live agent/browser. index.ts only renders their output.

const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)

// ---------- /diff ----------

export function formatDiff(
  diffText: string,
  opts: { maxLines?: number } = {},
): string {
  const maxLines = opts.maxLines ?? 200
  const trimmed = String(diffText ?? '')
    .split(CR + NL)
    .join(NL)
    .trimEnd()
  if (!trimmed) return '(no changes)'
  const lines = trimmed.split(NL)
  if (lines.length <= maxLines) return trimmed
  const head = lines.slice(0, maxLines).join(NL)
  const rest = lines.length - maxLines
  return (
    head +
    NL +
    '... [' +
    rest +
    ' more lines, use Bash git diff for the full output]'
  )
}

export function diffGitArgs(staged = false): string {
  return staged ? 'git diff --staged' : 'git diff'
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
  durationMs: number
  startedAt: string | null
}

export function summarizeTranscript(entries: TranscriptEntry[]): SessionStats {
  const stats: SessionStats = {
    turns: 0,
    toolCalls: 0,
    toolCounts: {},
    durationMs: 0,
    startedAt: null,
  }
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue
    if (e.type === 'user_task') stats.turns++
    if (e.type === 'tool_call') {
      stats.toolCalls++
      const tool = String(e.tool ?? '?')
      stats.toolCounts[tool] = (stats.toolCounts[tool] || 0) + 1
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

export function renderCost(
  stats: SessionStats,
  transcriptFile: string | null,
  tokenUsage: number | null = null,
): string {
  const lines: string[] = []
  lines.push('Session stats:')
  if (typeof tokenUsage === 'number') {
    lines.push(
      ' context: ~' + tokenUsage + ' tokens (DeepSeek accumulated_token_usage)',
    )
  } else {
    lines.push(
      ' context: unknown (DeepSeek reports it after the first answer in a chat)',
    )
  }
  lines.push(' tasks: ' + stats.turns)
  lines.push(' tool calls: ' + stats.toolCalls)
  const top = Object.entries(stats.toolCounts).sort((a, b) => b[1] - a[1])
  if (top.length) {
    lines.push(' by tool:')
    for (const [name, n] of top) lines.push(' ' + name + ': ' + n)
  }
  lines.push(' duration: ' + formatDuration(stats.durationMs))
  if (stats.startedAt) lines.push(' started: ' + stats.startedAt)
  lines.push(' transcript: ' + (transcriptFile || '(off)'))
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
}

export function renderDoctor(d: DoctorInput): string {
  const rows: string[] = []
  const row = (ok: boolean, label: string, value: string): void => {
    rows.push(
      ' ' + (ok ? '[OK] ' : '[WARN]') + ' ' + label.padEnd(16) + ' ' + value,
    )
  }
  row(true, 'node', d.nodeVersion)
  row(true, 'platform', d.platform)
  row(true, 'workdir', d.workdir)
  row(
    d.gitOk,
    'git',
    d.gitOk ? 'repo (' + (d.gitBranch || 'detached') + ')' : 'not a repository',
  )
  row(
    d.configOk,
    'config',
    d.configOk ? 'loaded' : 'error: ' + (d.configError || 'unknown'),
  )
  row(true, 'browser', d.browserChannel ? d.browserChannel : 'bundled chromium')
  row(
    !!d.authSaved,
    'auth',
    d.authSaved ? 'session saved (auto re-login ready)' : 'no saved session',
  )
  row(
    !!d.clipboardTool,
    'clipboard',
    d.clipboardTool || 'no tool found (image paste disabled)',
  )
  row(true, 'mcp', d.mcpServers + ' server(s), ' + d.mcpTools + ' tool(s)')
  row(d.transcriptOk, 'transcript', d.transcriptOk ? 'on' : 'off')
  if (typeof d.contextLimit === 'number' && d.contextLimit > 0) {
    row(true, 'context', d.contextLimit.toLocaleString('en-US') + ' tokens')
  }
  if (d.gitOk && typeof d.hasOrigin === 'boolean') {
    row(true, 'git remote', d.hasOrigin ? 'origin configured' : 'no origin')
  }
  if (typeof d.minSendIntervalMs === 'number') {
    row(
      d.minSendIntervalMs > 0,
      'send pause',
      Math.round(d.minSendIntervalMs / 1000) + 's between agent sends',
    )
  }
  return 'Doctor:' + NL + rows.join(NL)
}

// ---------- /permissions ----------

export interface PermissionsInput {
  write: boolean
  edit: boolean
  bash: boolean
  alwaysConfirm: string[]
}

export function renderPermissions(p: PermissionsInput): string {
  const onoff = (b: boolean): string => (b ? 'ask' : 'allow')
  const lines: string[] = []
  lines.push('Tool permissions (confirmation settings):')
  lines.push(' Write: ' + onoff(p.write))
  lines.push(' Edit: ' + onoff(p.edit))
  lines.push(' Bash: ' + onoff(p.bash))
  if (p.alwaysConfirm.length) {
    lines.push(' Always confirm (regex):')
    for (const re of p.alwaysConfirm) lines.push(' ' + re)
  }
  lines.push('')
  lines.push(
    'Change with: /config set confirmation.write false (and .edit / .bash)',
  )
  return lines.join(NL)
}

// ---------- /add-dir ----------

export function resolveExtraDir(
  input: string,
  workdir: string,
): { path: string } | { error: string } {
  const raw = String(input ?? '').trim()
  if (!raw) return { error: 'Usage: /add-dir <path>' }
  const abs = path.resolve(workdir, raw)
  if (abs === path.resolve(workdir)) {
    return { error: 'This is already the working directory.' }
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

// True when the queued message is a slash-command. It must NOT be merged into
// a task: the main loop has to execute it (e.g. /compact, /new).
export function isSlashCommand(text: string): boolean {
  return String(text ?? '')
    .trim()
    .startsWith('/')
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

// ---------- /review ----------

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
