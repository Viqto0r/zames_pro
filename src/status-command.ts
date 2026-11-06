import { translate, type TranslateFn } from './i18n.js'

// Pure formatting of `/status` and the `/doctor` row values: index.ts gathers
// the live state (browser toggles, transcript file, MCP pool) and this turns it
// into the lines the operator sees, so the empty-state branches (no chat, no
// git, no auth marker, no MCP) are unit-tested.

export interface StatusInput {
  workdir: string
  reviewMode: string | null
  origDir?: string | null
  chatId: string | null
  freshNext: boolean
  promptNext: boolean
  lastChat: string | null
  sessionsDir: string
  devMode: boolean
  maxIterations: number
  headless: boolean
  debug: boolean
  deepThinking: boolean
  webSearch: boolean
  undo: boolean
  checkpoint: boolean
  transcriptFile: string | null
  goal: string | null
  localeName: string
  mcpToolCount: number | null
  tokenUsage: number | null
}

/** Render `/status` as an array of lines (already localized). */
export function formatStatus(
  s: StatusInput,
  t: TranslateFn = translate('en'),
): string[] {
  const yes = t('common.yes')
  const no = t('common.no')
  const none = t('common.none')
  const onoff = (b: boolean): string => (b ? t('common.on') : t('common.off'))
  const lines: string[] = []
  // Every value printed here comes from the ENVIRONMENT (a working directory,
  // a chat id) or from the config: a newline in one of them starts a status
  // row of its own, so each value is flattened to one line — the same rule
  // renderDoctor already applies to its cells.
  const oneLine = (v: string): string => String(v ?? '').replace(/\s+/g, ' ')
  // A count must be a real number: `String(NaN)` used to print `NaN` in a row
  // that reads like a measurement.
  const count = (n: number): string =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 ? String(n) : '0'
  const val = (v: string | null | undefined, fallback: string): string =>
    v ? oneLine(v) : fallback
  lines.push(t('status.workdir', { v: oneLine(s.workdir) }))
  lines.push(
    t('status.review_mode', {
      v: s.reviewMode ? oneLine(s.reviewMode) : no,
    }),
  )
  if (s.reviewMode && s.origDir) {
    lines.push(t('status.orig_dir', { v: oneLine(s.origDir) }))
  }
  lines.push(t('status.chat', { v: val(s.chatId, none) }))
  lines.push(t('status.fresh_next', { v: s.freshNext ? yes : no }))
  lines.push(t('status.prompt_next', { v: s.promptNext ? yes : no }))
  lines.push(t('status.last_chat', { v: val(s.lastChat, none) }))
  lines.push(t('status.sessions', { v: oneLine(s.sessionsDir) }))
  lines.push(
    t('status.dev', { v: s.devMode ? t('common.on') : t('common.off') }),
  )
  lines.push(t('status.max_iter', { v: count(s.maxIterations) }))
  lines.push(t('status.headless', { v: s.headless ? yes : no }))
  lines.push(t('status.debug', { v: s.debug ? yes : no }))
  lines.push(
    t('status.toggles', {
      think: s.deepThinking ? yes : no,
      search: s.webSearch ? yes : no,
    }),
  )
  lines.push(t('status.undo', { v: onoff(s.undo) }))
  lines.push(t('status.checkpoint', { v: onoff(s.checkpoint) }))
  lines.push(
    t('status.transcript', {
      v: s.transcriptFile ? oneLine(s.transcriptFile) : t('common.off'),
    }),
  )
  // The GOAL is operator text (`/goal <free text>`): one status entry must
  // stay on one line.
  lines.push(t('status.goal', { v: s.goal ? oneLine(s.goal) : none }))
  lines.push(t('status.locale', { v: oneLine(s.localeName) }))
  // A NEGATIVE tool count is nonsense (a broken MCP server status, a
  // hand-edited value): "MCP tools: -2" reads like a real measurement.
  const mcpCount =
    s.mcpToolCount === null ||
    !Number.isFinite(s.mcpToolCount) ||
    s.mcpToolCount < 0
      ? t('common.unknown')
      : String(s.mcpToolCount)
  lines.push(t('status.mcp', { v: mcpCount }))
  // A NEGATIVE count is nonsense (a broken provider counter): show "unknown"
  // rather than a number that reads like a real measurement.
  const tokens =
    s.tokenUsage === null || !Number.isFinite(s.tokenUsage) || s.tokenUsage < 0
      ? null
      : s.tokenUsage
  lines.push(
    t('status.tokens', {
      v: tokens === null ? t('common.unknown') : String(tokens),
    }),
  )
  return lines
}

/**
 * The `/doctor` rows that depend on a LIVE PROBE rather than on the config:
 * git availability + branch, clipboard, MCP, the auth marker and the UI health
 * result. `renderDoctor` (commands.ts) renders the full table from these.
 */
export function doctorProbeSummary(p: {
  gitOk: boolean
  gitBranch: string | null
  mcpServers: number
  mcpTools: number
  authSaved: boolean
  uiPresent?: string[]
  uiMissingCritical?: string[]
}): { status: 'ok' | 'warn'; label: string }[] {
  const rows: { status: 'ok' | 'warn'; label: string }[] = []
  // A branch name, a missing capability id and a server/tool COUNT come from
  // the repository and from a broken MCP probe: a newline started a row of its
  // own and `NaN`/`-3` read like real measurements.
  const oneLine = (v: string): string => String(v ?? '').replace(/\s+/g, ' ')
  const count = (n: number): number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0
  rows.push({
    status: p.gitOk ? 'ok' : 'warn',
    label: p.gitOk
      ? 'git: ' + oneLine(p.gitBranch || 'detached')
      : 'git: absent',
  })
  rows.push({
    status: p.authSaved ? 'ok' : 'warn',
    label: p.authSaved ? 'auth: saved' : 'auth: not saved',
  })
  const servers = count(p.mcpServers)
  const tools = count(p.mcpTools)
  rows.push({
    status: tools > 0 ? 'ok' : 'warn',
    label: 'mcp: ' + String(servers) + ' servers / ' + String(tools) + ' tools',
  })
  if (p.uiMissingCritical && p.uiMissingCritical.length) {
    rows.push({
      status: 'warn',
      label: 'ui: missing ' + oneLine(p.uiMissingCritical.join(', ')),
    })
  }
  return rows
}
