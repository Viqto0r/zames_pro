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
  lines.push(t('status.workdir', { v: s.workdir }))
  lines.push(
    t('status.review_mode', { v: s.reviewMode || t('status.review_none') }),
  )
  if (s.reviewMode && s.origDir) {
    lines.push(t('status.orig_dir', { v: s.origDir }))
  }
  lines.push(t('status.chat', { v: s.chatId || none }))
  lines.push(t('status.fresh_next', { v: s.freshNext ? yes : no }))
  lines.push(t('status.prompt_next', { v: s.promptNext ? yes : no }))
  lines.push(t('status.last_chat', { v: s.lastChat || none }))
  lines.push(t('status.sessions', { v: s.sessionsDir }))
  lines.push(
    t('status.dev', { v: s.devMode ? t('common.on') : t('common.off') }),
  )
  lines.push(t('status.max_iter', { v: s.maxIterations }))
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
  lines.push(t('status.transcript', { v: s.transcriptFile || t('common.off') }))
  // The GOAL is operator text (`/goal <free text>`) and a newline in it would
  // start a new terminal line, faking another status row (`FAKE: hacked`) —
  // one status entry must stay on one line.
  const oneLine = (v: string): string => String(v ?? '').replace(/\s+/g, ' ')
  lines.push(t('status.goal', { v: s.goal ? oneLine(s.goal) : none }))
  lines.push(t('status.locale', { v: s.localeName }))
  // A NEGATIVE tool count is nonsense (a broken MCP server status, a
  // hand-edited value): "MCP tools: -2" reads like a real measurement, the
  // same rule the token counter below already follows.
  const mcpCount =
    s.mcpToolCount === null || s.mcpToolCount < 0 ? none : s.mcpToolCount
  lines.push(t('status.mcp', { v: mcpCount }))
  // A NEGATIVE count is nonsense (a broken provider counter): show "unknown"
  // rather than a number that reads like a real measurement.
  const tokens = s.tokenUsage === null || s.tokenUsage < 0 ? null : s.tokenUsage
  lines.push(
    t('status.tokens', {
      v: tokens === null ? t('common.unknown') : tokens,
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
  rows.push({
    status: p.gitOk ? 'ok' : 'warn',
    label: p.gitOk ? 'git: ' + (p.gitBranch || 'detached') : 'git: absent',
  })
  rows.push({
    status: p.authSaved ? 'ok' : 'warn',
    label: p.authSaved ? 'auth: saved' : 'auth: not saved',
  })
  rows.push({
    status: p.mcpTools > 0 ? 'ok' : 'warn',
    label:
      'mcp: ' +
      String(p.mcpServers) +
      ' servers / ' +
      String(p.mcpTools) +
      ' tools',
  })
  if (p.uiMissingCritical && p.uiMissingCritical.length) {
    rows.push({
      status: 'warn',
      label: 'ui: missing ' + p.uiMissingCritical.join(', '),
    })
  }
  return rows
}
