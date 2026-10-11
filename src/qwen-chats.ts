// PURE scraping/parsing helpers for the Qwen provider (chat.qwen.ai).
//
// WHY a separate module (mirroring browser-chats.ts for DeepSeek): the chat
// list and the restored dialogue are read from a page we do not control, so
// the scraping policy must have ONE home that can be unit-tested WITHOUT
// Playwright. These functions run INSIDE page.evaluate, so they must not close
// over module scope — they use only their arguments and DOM globals.
//
// Values verified against a live guest session:
//   chat links  -> a[href*="/c/"] (a guest chat is /c/guest, skipped)
//   messages    -> markdown/answer blocks inside message containers

import type { ChatInfo, ChatMessage } from './types.js'

// Pull the chat id out of a Qwen chat link. A guest chat (/c/guest) is not a
// real, resumable chat and is filtered by the caller.
const CHAT_HREF_RE = /\/c\/([A-Za-z0-9_-]+)/

/**
 * In-page scraper for the sidebar chat list. Returns the links' ids/titles in
 * document order, de-duplicated, capped at `limit`. A guest session has no
 * sidebar history, so the result is legitimately empty.
 */
export function scrapeQwenChatList(limit: number): ChatInfo[] {
  const out: ChatInfo[] = []
  const seen = new Set<string>()
  const anchors = document.querySelectorAll('a[href*="/c/"], a[href*="/chat"]')
  for (const a of Array.from(anchors) as HTMLAnchorElement[]) {
    const href = a.getAttribute('href') || ''
    const m = href.match(CHAT_HREF_RE)
    if (!m) continue
    if (m[1] === 'guest') continue
    if (seen.has(m[1])) continue
    seen.add(m[1])
    const titleEl = a.querySelector('[class*="title"], [class*="name"]')
    const title = ((titleEl ? titleEl.textContent : a.textContent) || '')
      .trim()
      .replace(/\s+/g, ' ')
    out.push({ id: m[1], title })
    if (out.length >= limit) break
  }
  return out
}

export interface QwenScrapeMessagesOptions {
  containerSels: string[]
  /** Class-name regex source for reasoning blocks to skip (not the answer). */
  thinkRe: string
  /** Class-name regex source for an assistant message. */
  assistantRe: string
}

/**
 * In-page scraper for the WHOLE visible dialogue of the open chat. Nested
 * duplicate containers are collapsed to the OUTERMOST one: the broad
 * `[class*="message"]` chain matched both an outer wrapper and an inner block,
 * which printed every turn TWICE (observed live: 'assistant:teal' twice).
 * Reasoning blocks (think class, on the node or an ancestor) are skipped.
 */
export function scrapeQwenChatMessages(
  opts: QwenScrapeMessagesOptions,
): ChatMessage[] {
  const thinkRe = new RegExp(opts.thinkRe, 'i')
  const assistantRe = new RegExp(opts.assistantRe, 'i')
  const inThink = (e: Element | null): boolean => {
    let n: Element | null = e
    while (n) {
      if (thinkRe.test((n.className || '').toString())) return true
      n = n.parentElement
    }
    return false
  }

  let containers: Element[] = []
  for (const sel of opts.containerSels) {
    const found = Array.from(document.querySelectorAll(sel)).filter(
      (e) => !inThink(e) && (e.textContent || '').trim().length > 0,
    )
    if (found.length) {
      containers = found
      break
    }
  }
  const uniq = Array.from(new Set(containers))
  // Keep only the OUTERMOST block of a nested pair.
  const blocks = uniq.filter((b) => !uniq.some((o) => o !== b && o.contains(b)))

  const out: ChatMessage[] = []
  for (const c of blocks) {
    let node: Element | null = c.querySelector(
      '[class*="markdown"], [class*="answer"]',
    )
    const isAssistant = assistantRe.test(c.className || '') || !!node
    if (!node) node = c
    const text = (node.textContent || '').trim()
    if (!text) continue
    out.push({ role: isAssistant ? 'assistant' : 'user', text })
  }
  return out
}

// ---------- API payload parsers (pure, unit-tested) ----------

/**
 * Parse the chat list from `GET /api/v2/chats/?page=1&exclude_project=true`.
 * The shape has drifted between builds, so accept several:
 *   { data: [ {id,title} ] }, { data: { chats: [...] } }, { data: { list: [...] } }.
 * Returns [] for anything unrecognizable (never throws).
 */
export function parseQwenChatList(json: unknown): ChatInfo[] {
  const root = json as { data?: unknown } | null
  const data = root && typeof root === 'object' ? root.data : null
  const arr: unknown = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as Record<string, unknown>).chats ??
        (data as Record<string, unknown>).list ??
        (data as Record<string, unknown>).items)
      : null
  if (!Array.isArray(arr)) return []
  const out: ChatInfo[] = []
  for (const c of arr) {
    if (!c || typeof c !== 'object') continue
    const m = c as Record<string, unknown>
    const id =
      typeof m.id === 'string'
        ? m.id
        : typeof m.chat_id === 'string'
          ? m.chat_id
          : ''
    if (!id) continue
    const title =
      (typeof m.title === 'string' && m.title) ||
      (typeof m.name === 'string' && m.name) ||
      ''
    out.push({ id, title: title.trim() })
  }
  return out
}

/**
 * Parse one chat's history from `GET /api/v2/chats/<id>?direction=up&limit=N`.
 * Accepts the plausible shapes:
 *   { data: { messages: [...] } }, { data: { chat: { messages } } }, { data: [...] }.
 * A message's text is taken from `content` (string) or from `fragments[]`
 * (a DeepSeek-style payload: keep REQUEST for user, RESPONSE for assistant).
 */
export function parseQwenHistory(json: unknown): ChatMessage[] {
  const root = json as { data?: unknown } | null
  const data = root && typeof root === 'object' ? root.data : null
  let arr: unknown = null
  if (Array.isArray(data)) arr = data
  else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (Array.isArray(d.messages)) arr = d.messages
    else if (d.chat && typeof d.chat === 'object') {
      const chat = d.chat as Record<string, unknown>
      if (Array.isArray(chat.messages)) arr = chat.messages
    }
  }
  if (!Array.isArray(arr)) return []
  const out: ChatMessage[] = []
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue
    const m = raw as Record<string, unknown>
    // Role detection is DEFENSIVE: the field has been `role` (string,
    // case-insensitive), a numeric flag, or `is_user`. Anything that is not
    // clearly the user is treated as the assistant (the restored dialogue
    // cares about the distinction, not the exact enum).
    const roleStr = String(m.role ?? '').toLowerCase()
    const isUser =
      roleStr === 'user' ||
      roleStr === '0' ||
      m.is_user === true ||
      m.from === 'user'
    const role: ChatMessage['role'] = isUser ? 'user' : 'assistant'
    let text = ''
    if (typeof m.content === 'string') text = m.content
    else if (typeof m.text === 'string') text = m.text
    else if (Array.isArray(m.fragments)) {
      const want = role === 'assistant' ? 'RESPONSE' : 'REQUEST'
      for (const fr of m.fragments as Array<Record<string, unknown>>) {
        if (fr && fr.type === want && typeof fr.content === 'string') {
          text += fr.content
        }
      }
    }
    text = text.trim()
    if (text) out.push({ role, text })
  }
  return out
}
