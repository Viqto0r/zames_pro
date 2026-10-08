import type { ChatMessage } from './browser.js'

// PURE parsing of the DeepSeek history/message payloads (BACKLOG C3). These
// helpers are extracted from DeepSeekBrowser.fetchChatMessages: they used to be
// copy-pasted INLINE twice (the in-page evaluate AND the Playwright-request
// fallback), so the same role/fragment extraction lived in two places and could
// drift. They operate on plain JSON, touch no browser state, and are
// unit-tested without Playwright.

// Collapse 3+ blank lines to one blank line and trim — DeepSeek pads the
// fragments with newlines and the raw text looked double-spaced in the
// restored dialogue.
export function tidyFragmentText(text: string): string {
  const NL = String.fromCharCode(10)
  return String(text || '')
    .replace(new RegExp(NL + '{3,}', 'g'), NL + NL)
    .trim()
}

interface RawFragment {
  type?: string
  content?: string
}

interface RawHistoryMessage {
  role?: string
  accumulated_token_usage?: number
  fragments?: RawFragment[]
}

/**
 * Extract displayable messages from `data.biz_data.chat_messages[]`.
 *
 * Assistant turns keep only RESPONSE fragments, user turns only REQUEST
 * fragments (THINK/FILE fragments are dropped, matching the live reader). The
 * LATEST `accumulated_token_usage` seen in the payload is returned as
 * `usage` (each message carries the running counter).
 */
export function parseHistoryMessages(messages: unknown): {
  list: ChatMessage[]
  usage: number | null
} {
  if (!Array.isArray(messages)) return { list: [], usage: null }
  const list: ChatMessage[] = []
  let usage: number | null = null
  for (const raw of messages as RawHistoryMessage[]) {
    if (raw && typeof raw.accumulated_token_usage === 'number') {
      usage = raw.accumulated_token_usage
    }
    const role: ChatMessage['role'] =
      raw && raw.role === 'ASSISTANT' ? 'assistant' : 'user'
    const want = role === 'assistant' ? 'RESPONSE' : 'REQUEST'
    let text = ''
    for (const fr of (raw && raw.fragments) || []) {
      if (!fr || fr.type !== want) continue
      if (typeof fr.content === 'string') text += fr.content
    }
    text = tidyFragmentText(text)
    if (text) list.push({ role, text })
  }
  return { list, usage }
}

/**
 * Pull `chat_messages` out of a history_messages JSON response, tolerating the
 * two shapes the endpoint has shipped (`data.biz_data.chat_messages`); returns
 * null when the shape does not match, so the caller can report a clear error.
 */
export function extractChatMessages(json: unknown): unknown[] | null {
  const j = json as {
    data?: { biz_data?: { chat_messages?: unknown } }
  } | null
  const messages = j?.data?.biz_data?.chat_messages
  return Array.isArray(messages) ? messages : null
}

/**
 * In-page scraper for the chat list (the sidebar anchors). Runs INSIDE the
 * page via page.evaluate, so it must NOT close over module scope — it only
 * uses its `limit` argument and DOM globals. Kept as a named export so the
 * class body stays thin and this scraping policy has ONE home.
 */
export function scrapeChatList(limit: number): Array<{
  id: string
  title: string
  href: string
}> {
  const out: Array<{ id: string; title: string; href: string }> = []
  const seen = new Set<string>()
  const anchors = document.querySelectorAll('a[href*="/chat/"]')
  for (const a of Array.from(anchors)) {
    const href = a.getAttribute('href') || ''
    const m =
      href.match(/\/chat\/s\/([a-zA-Z0-9_-]+)/) ||
      href.match(/\/a\/chat\/s\/([a-zA-Z0-9_-]+)/)
    if (!m) continue
    const id = m[1]
    if (seen.has(id)) continue
    seen.add(id)

    const titleEl = a.querySelector('[class*="title"], [class*="text"]')
    let title = (titleEl ? titleEl.textContent : a.textContent) || ''
    title = title.trim().replace(/\s+/g, ' ')
    if (!title) title = '(без названия)'

    out.push({ id, title, href })
    if (out.length >= limit) break
  }
  return out
}

export interface ScrapeMessagesOptions {
  containerSels: string[]
  answerSels: string[]
  thinkRe: string
  assistantRe: string
  assistantSel: string
  markdownSel: string
}

/**
 * In-page scraper for the WHOLE visible dialogue of the open chat. Runs INSIDE
 * the page via page.evaluate (no module-scope closure). Message-level
 * containers are tried first, then assistant-only answer wrappers as a
 * fallback; nested duplicate blocks are collapsed to the OUTERMOST one (some
 * builds match both an outer and an inner container, which printed each turn
 * twice). The model's reasoning (think class) is skipped.
 */
export function scrapeChatMessages(
  opts: ScrapeMessagesOptions,
): Array<{ role: string; text: string }> {
  const think = new RegExp(opts.thinkRe, 'i')
  const assistantRe = new RegExp(opts.assistantRe, 'i')
  const inThink = (e: Element | null): boolean => {
    let n: Element | null = e
    while (n) {
      const cls = (n.className || '').toString()
      if (think.test(cls)) return true
      n = n.parentElement
    }
    return false
  }
  const textOf = (e: Element): string => {
    const h = e as HTMLElement
    const t = h.innerText || h.textContent || ''
    const NL = String.fromCharCode(10)
    return t.replace(new RegExp(NL + '{3,}', 'g'), NL + NL).trim()
  }

  const looksAssistant = (e: Element): boolean => {
    const cls = (e.className || '').toString()
    if (assistantRe.test(cls)) return true
    if (e.querySelector(opts.assistantSel)) return true
    if (e.querySelector(opts.markdownSel)) return true
    return false
  }

  let blocks: Element[] = []
  for (const s of opts.containerSels) {
    const found = Array.from(document.querySelectorAll(s)).filter(
      (e) => !inThink(e) && textOf(e).length > 0,
    )
    if (found.length) {
      blocks = found
      break
    }
  }
  if (blocks.length > 1) {
    const unique = Array.from(new Set(blocks))
    blocks = unique.filter(
      (b) => !unique.some((other) => other !== b && other.contains(b)),
    )
  }

  const out: Array<{ role: string; text: string }> = []
  if (blocks.length) {
    for (const b of blocks) {
      const t = textOf(b)
      if (!t) continue
      out.push({ role: looksAssistant(b) ? 'assistant' : 'user', text: t })
    }
    if (out.length) return out
  }

  for (const s of opts.answerSels) {
    const list = Array.from(document.querySelectorAll(s)).filter(
      (e) => !inThink(e),
    )
    if (!list.length) continue
    for (const el of list) {
      const t = textOf(el)
      if (t) out.push({ role: 'assistant', text: t })
    }
    break
  }
  return out
}
