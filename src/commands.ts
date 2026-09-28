import path from 'path'

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
 const trimmed = String(diffText ?? '').split(CR + NL).join(NL).trimEnd()
 if (!trimmed) return '(no changes)'
 const lines = trimmed.split(NL)
 if (lines.length <= maxLines) return trimmed
 const head = lines.slice(0, maxLines).join(NL)
 const rest = lines.length - maxLines
 return (
 head +
 NL +
 '... [' + rest + ' more lines, use Bash git diff for the full output]'
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

export function formatDuration(ms: number): string {
 const total = Math.max(0, Math.round(ms / 1000))
 const h = Math.floor(total / 3600)
 const m = Math.floor((total % 3600) / 60)
 const s = total % 60
 const pad = (n: number): string => String(n).padStart(2, '0')
 if (h > 0) return h + 'h ' + pad(m) + 'm ' + pad(s) + 's'
 if (m > 0) return m + 'm ' + pad(s) + 's'
 return s + 's'
}

export function renderCost(
 stats: SessionStats,
 transcriptFile: string | null,
): string {
 const lines: string[] = []
 lines.push('Session stats (DeepSeek web does not expose token counts):')
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

/** One message of a restored chat, as read from the DeepSeek DOM. */
export interface RestoredMessage {
  role: 'user' | 'assistant'
  text: string
}

/** How many characters of the dialogue are printed by default. */
export const RESTORED_HISTORY_LIMIT = 20

/**
 * Is this message worth showing to the operator as part of the dialogue?
 *
 * The chat history contains a lot of protocol noise that is meaningless in
 * the terminal: the system-prompt (a huge REQUEST), tool results
 * ("Tool result for ..."), the agent's raw tool-calls (JSON / DSML), the
 * "You stopped after a tool result..." nudges, and the agent's <system> notes.
 * We keep only real user turns and real assistant answers.
 */
export function isDisplayableMessage(m: RestoredMessage): boolean {
  const text = String((m && m.text) || '').trim()
  if (!text) return false
  if (text.length > 100_000) return false // the system-prompt / a giant blob
  if (m.role === 'user') {
    // Tool output, the system-prompt and the corrective nudges are not the
    // operator's words.
    if (/^Tool result for /.test(text)) return false
    if (/^You are a coding agent running in a terminal/.test(text)) return false
    if (/^You stopped after a tool result/.test(text)) return false
    if (/^\[system\]/.test(text)) return false
    if (/^The user ran \//.test(text)) return false
    return true
  }
  // Assistant: a tool-call (JSON or DSML) is not an answer to show. The
  // DSML markers use FULL-WIDTH vertical bars (｜｜DSML), so the regex must
  // match them, not the ASCII pipe.
  if (/DSML/i.test(text)) return false
  if (/^<system>/i.test(text)) return false
  if (/"tool"\s*:/.test(text.slice(0, 600))) {
    return false
  }
  if (/^\s*[\[{]/.test(text) && /"args"\s*:/.test(text.slice(0, 600))) {
    return false
  }
  return true
}

/**
 * Keep only the last `limit` messages and drop empties/service noise. The
 * source (network history or DOM) may contain protocol messages; they are
 * filtered out here so the terminal output stays readable.
 */
export function trimRestoredMessages(
  messages: RestoredMessage[],
  limit = RESTORED_HISTORY_LIMIT,
): RestoredMessage[] {
  const clean = (messages || []).filter(
    (m) => m && typeof m.text === 'string' && isDisplayableMessage(m),
  )
  if (limit > 0 && clean.length > limit) return clean.slice(clean.length - limit)
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
  const list = trimRestoredMessages(messages, opts.limit ?? RESTORED_HISTORY_LIMIT)
  const out: string[] = []
  for (const m of list) {
    const marker = m.role === 'user' ? '❯ ' : '● '
    out.push(marker + m.text.trim())
  }
  return out.join(NL + NL)
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
