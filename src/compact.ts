import type { Locale } from './i18n.js'
import { translate } from './i18n.js'
import {
  buildCompactPrompt,
  buildCompactCarryover,
  isUsableCompactSummary,
  trimRestoredMessages,
  formatRestoredHistory,
} from './commands.js'
import type { BrowserLike, ToolDef } from './types.js'
import { loadHooks, runLifecycleHooks } from './hooks.js'

const NL = String.fromCharCode(10)

/** How many times the summary call is retried before the local fallback. */
export const COMPACT_SUMMARY_ATTEMPTS = 3
/** How many restored messages the local fallback keeps. */
export const COMPACT_FALLBACK_LIMIT = 40

/** Minimal transcript surface used by performCompact (a subset of Transcript). */
export interface CompactTranscript {
  log: (event: string, data?: Record<string, unknown>) => void
}

/** Minimal UI surface: lock/unlock + print above the input line. */
export interface CompactUi {
  lock: (status?: string) => void
  unlock: () => void
  printAbove: (text: unknown) => void
}

/** Builds the system prompt for the NEW chat (injected to avoid a cycle). */
export type BuildSystemPromptFn = (opts: {
  workdir: string
  tools: ToolDef[]
  locale: Locale
  selfImprovement?: boolean
}) => string

export interface PerformCompactOptions {
  browser: BrowserLike
  currentChatId: string | null
  workdir: string
  locale: Locale
  /** The operator's original goal, carried into the new chat. */
  task?: string
  transcript?: CompactTranscript | null
  ui?: CompactUi | null
  /** Builds the system prompt for the new chat. */
  buildSystemPrompt: BuildSystemPromptFn
  /** Tools passed to buildSystemPrompt (unused otherwise). */
  tools: ToolDef[]
  /** Answer timeout for the summary call (ms). */
  answerTimeoutMs: number
  /** How many restored messages the local fallback keeps. */
  fallbackLimit?: number
  /** When true, do NOT lock/unlock the UI (the caller manages it). */
  skipUiLock?: boolean
  /** Suppress the human-readable console output (auto path uses notices). */
  quiet?: boolean
  /** Dev-mode BACKLOG note in the rebuilt system prompt (see system-prompt). */
  selfImprovement?: boolean
}

export interface PerformCompactResult {
  ok: boolean
  /** The chat id AFTER compaction (the new chat when ok). */
  chatId: string | null
  /** Chars in the summary used. */
  summaryChars: number
  /** Token count BEFORE compaction (null when unknown). */
  beforeTokens: number | null
  /** Error/abort reason when ok === false. */
  error?: string
}

/**
 * Compact the CURRENT chat: summarize it (retrying a few times, with a LOCAL
 * history fallback), open a NEW chat, resend the system prompt and post the
 * summary as the carried-over context. Shared by the manual `/compact` command
 * and the automatic between-tools trigger, so both paths stay identical.
 *
 * The caller owns the browser and the throttle; this function only sends.
 */
export async function performCompact(
  opts: PerformCompactOptions,
): Promise<PerformCompactResult> {
  const {
    browser,
    workdir,
    locale,
    task,
    transcript = null,
    ui = null,
    buildSystemPrompt,
    tools,
    answerTimeoutMs,
    fallbackLimit = COMPACT_FALLBACK_LIMIT,
    skipUiLock = false,
    quiet = false,
    selfImprovement = false,
  } = opts
  const t = translate(locale)
  const log = (msg: string): void => {
    if (!quiet) console.error(msg)
  }

  let currentChatId = opts.currentChatId
  if (!currentChatId) {
    currentChatId = await browser.getCurrentChatId()
  }
  if (!currentChatId) {
    log(t('compact.no_chat'))
    return {
      ok: false,
      chatId: null,
      summaryChars: 0,
      beforeTokens: null,
      error: t('compact.no_chat'),
    }
  }

  const beforeTokens = browser.getLastTokenUsage
    ? browser.getLastTokenUsage()
    : null

  if (ui && !skipUiLock) ui.lock(t('msg.input_locked'))
  try {
    if (!quiet) log(t('compact.start'))

    // PreCompact hook (N32): runs BEFORE the chat is summarized/rewritten, so
    // a hook can persist state or notify. Best-effort.
    try {
      const out = await runLifecycleHooks(
        loadHooks(workdir),
        'PreCompact',
        workdir,
        { chatId: currentChatId },
      )
      if (out) transcript?.log('hook_pre_compact', { output: out })
    } catch {}

    // 1) Ask the OLD chat to summarize itself.
    let summary = ''
    let summaryErr = ''
    for (let attempt = 1; attempt <= COMPACT_SUMMARY_ATTEMPTS; attempt++) {
      let prompt = buildCompactPrompt(locale)
      if (attempt > 1) {
        prompt +=
          locale === 'en'
            ? '\n\nIMPORTANT: reply with the summary as PLAIN TEXT only. Do NOT call any tools and do NOT output tool-call JSON/DSML.'
            : '\n\nВАЖНО: ответь ТОЛЬКО текстом резюме. НЕ вызывай инструменты и НЕ выводи JSON/DSML вызова инструмента.'
      }
      let answer = ''
      try {
        answer = await browser.ask(prompt, {
          agent: true,
          timeout: Math.max(60_000, answerTimeoutMs),
        })
      } catch (e) {
        summaryErr = (e as Error).message
      }
      const trimmed = String(answer || '').trim()
      if (/^\(прервано пользователем\)$/.test(trimmed)) {
        return {
          ok: false,
          chatId: currentChatId,
          summaryChars: 0,
          beforeTokens,
          error: trimmed,
        }
      }
      if (!summaryErr && isUsableCompactSummary(trimmed)) {
        summary = trimmed
        summaryErr = ''
        break
      }
      if (!summaryErr) summaryErr = trimmed || t('common.unknown')
      if (attempt < COMPACT_SUMMARY_ATTEMPTS) {
        log(
          t('compact.summary_retry', {
            v: summaryErr,
            attempt: String(attempt),
            max: String(COMPACT_SUMMARY_ATTEMPTS),
          }),
        )
        await new Promise((r) => setTimeout(r, 3000 * attempt))
      }
    }

    if (!summary) {
      let fallback = ''
      try {
        const all =
          browser.fetchChatMessages && currentChatId
            ? await browser.fetchChatMessages(currentChatId).catch(() => [])
            : []
        const msgs = trimRestoredMessages(all, 0)
        if (msgs.length) {
          fallback = formatRestoredHistory(msgs, { limit: fallbackLimit })
        }
      } catch {}
      fallback = String(fallback || '').trim()
      if (fallback) {
        summary = fallback
        log(t('compact.summary_fallback', { v: String(fallbackLimit) }))
      } else {
        const err = summaryErr || t('common.unknown')
        log(t('compact.summary_failed', { v: err }))
        return {
          ok: false,
          chatId: currentChatId,
          summaryChars: 0,
          beforeTokens,
          error: err,
        }
      }
    }

    transcript?.log('compact_summary', {
      chars: summary.length,
      beforeTokens,
    })

    // 2) New chat + system prompt + the summary as the first message.
    await browser.newChat()
    await browser.ask(
      buildSystemPrompt({ workdir, tools, locale, selfImprovement }),
      {
        timeout: 60_000,
        agent: false,
      },
    )
    await browser.ask(buildCompactCarryover(summary, task), {
      timeout: 60_000,
      agent: false,
    })

    const newChatId = browser.getCurrentChatId
      ? await browser.getCurrentChatId()
      : null
    if (!quiet) {
      log(
        t('compact.done') +
          NL +
          t('compact.report', {
            chars: summary.length,
            tokens:
              beforeTokens === null
                ? t('common.unknown')
                : String(beforeTokens),
          }),
      )
    }
    if (ui && !quiet) {
      ui.printAbove(
        NL +
          '--- compacted context ---' +
          NL +
          summary +
          NL +
          '--- end ---' +
          NL,
      )
    }
    return {
      ok: true,
      chatId: newChatId,
      summaryChars: summary.length,
      beforeTokens,
    }
  } catch (e) {
    log((e as Error).message)
    return {
      ok: false,
      chatId: currentChatId,
      summaryChars: 0,
      beforeTokens,
      error: (e as Error).message,
    }
  } finally {
    if (ui && !skipUiLock) ui.unlock()
  }
}
