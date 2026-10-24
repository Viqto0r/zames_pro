// PURE scraping/parsing helpers for the GLM provider (chat.z.ai).
//
// Mirrors qwen-chats.ts: the chat list and the restored dialogue are read from
// a page we do not control, so the policy has ONE home that is unit-testable
// WITHOUT Playwright. The scrapers run INSIDE page.evaluate, so they use only
// their arguments and DOM globals.
//
// Live shapes (see test/fixtures/glm/):
//   GET /api/v1/chats/?page=1  -> a BARE ARRAY of {id,title,updated_at,...}
//   GET /api/v1/chats/<id>     -> {chat:{history:{messages:{<id>:{...}}}}}; the
//                                 assistant node carries NO content (verified),
//                                 so a restored dialogue is mostly the user's
//                                 turns and the answers come from the DOM.
//   a chat link                -> a[href="/c/<uuid>"]

import type { ChatInfo, ChatMessage } from './types.js'

const CHAT_HREF_RE =
  /\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

/**
 * In-page scraper for the sidebar chat list (fallback for when the API call
 * fails). Returns ids/titles in document order, de-duplicated, capped at
 * `limit`. The title element inside a z.ai row is not class-stable, so the
 * row's textContent (collapsed) is used.
 */
export function scrapeGlmChatList(limit: number): ChatInfo[] {
  const out: ChatInfo[] = []
  const seen = new Set<string>()
  const anchors = document.querySelectorAll('a[href*="/c/"]')
  for (const a of Array.from(anchors) as HTMLAnchorElement[]) {
    const href = a.getAttribute('href') || ''
    const m = href.match(CHAT_HREF_RE)
    if (!m) continue
    if (seen.has(m[1])) continue
    seen.add(m[1])
    const title = ((a.textContent || '') as string).trim().replace(/\s+/g, ' ')
    out.push({ id: m[1], title })
    if (out.length >= limit) break
  }
  return out
}

export interface GlmScrapeMessagesOptions {
  containerSels: string[]
  /** Class-name regex source for reasoning blocks to skip (not the answer). */
  thinkRe: string
  /** Class-name regex source for a USER message. */
  userRe: string
}

/**
 * In-page scraper for the WHOLE visible dialogue of the open chat. Nested
 * duplicate containers are collapsed to the OUTERMOST one (the same real bug
 * as Qwen: a broad selector matched both the wrapper and the inner block and
 * every turn printed twice). Reasoning blocks are skipped by class.
 */
export function scrapeGlmChatMessages(
  opts: GlmScrapeMessagesOptions,
): ChatMessage[] {
  const thinkRe = new RegExp(opts.thinkRe, 'i')
  const userRe = new RegExp(opts.userRe, 'i')
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
  const blocks = uniq.filter((b) => !uniq.some((o) => o !== b && o.contains(b)))

  const out: ChatMessage[] = []
  for (const c of blocks) {
    const role: ChatMessage['role'] = userRe.test(
      (c.className || '').toString(),
    )
      ? 'user'
      : 'assistant'
    const text = (c.textContent || '').trim()
    if (!text) continue
    out.push({ role, text })
  }
  return out
}

// ---------- API payload parsers (pure, unit-tested) ----------

/**
 * Parse `GET /api/v1/chats/?page=1`. The live shape is a BARE ARRAY; older /
 * other builds wrap it in `{data:[...]}` or key it by id. Returns [] for
 * anything unrecognizable (never throws).
 */
export function parseGlmChatList(json: unknown): ChatInfo[] {
  // Unwrap up to THREE levels of list wrappers: a paginated reply nests them
  // (`{data:{list:{page,data:[…]}}}`, `{chats:{page,data:[…]}}`). Leaving an
  // inner wrapper in place made its KEY (`'data'`/`'list'`) look like a chat id
  // with an empty title, so /chats showed one fake chat and hid the real ones.
  // A bare id-keyed MAP of chats has none of these keys and is kept as-is.
  let arr: unknown = json
  for (let depth = 0; depth < 3; depth++) {
    if (!arr || typeof arr !== 'object' || Array.isArray(arr)) break
    const o = arr as Record<string, unknown>
    const next = o.data ?? o.chats ?? o.list ?? o.items
    if (next === undefined) break
    arr = next
  }
  const keyed: Array<[string, unknown]> | null = Array.isArray(arr)
    ? null
    : arr && typeof arr === 'object'
      ? Object.entries(arr as Record<string, unknown>)
      : null
  if (!Array.isArray(arr) && !keyed) return []
  const entries: Array<[string, unknown]> = Array.isArray(arr)
    ? arr.map((c) => ['', c] as [string, unknown])
    : (keyed as Array<[string, unknown]>)
  const out: ChatInfo[] = []
  // A payload may list the SAME chat twice (a merged page). /chats would then
  // show it twice and the second row opens the same chat — keep the first.
  const seenIds = new Set<string>()
  for (const [key, c] of entries) {
    if (!c || typeof c !== 'object') continue
    const m = c as Record<string, unknown>
    const raw = m.id ?? m.chat_id
    const id =
      typeof raw === 'string'
        ? raw
        : typeof raw === 'number' && Number.isFinite(raw)
          ? String(raw)
          : key
    if (!id || seenIds.has(id)) continue
    seenIds.add(id)
    const title =
      (typeof m.title === 'string' && m.title) ||
      (typeof m.name === 'string' && m.name) ||
      ''
    out.push({ id, title: title.trim() })
  }
  return out
}

/**
 * Parse one chat's history from `GET /api/v1/chats/<id>`. The live shape is
 * `{chat:{history:{messages:{<id>:{role,content,...}}}}}`; an array and a flat
 * `messages` are accepted too. Assistant nodes carry NO content in the live
 * response, so those turns are simply absent (the DOM is the fallback).
 */
export function parseGlmHistory(json: unknown): ChatMessage[] {
  const root = json as Record<string, unknown> | null
  if (!root || typeof root !== 'object') return []
  let messages: unknown = root.messages
  if (!messages && root.chat && typeof root.chat === 'object') {
    const chat = root.chat as Record<string, unknown>
    if (chat.history && typeof chat.history === 'object') {
      messages = (chat.history as Record<string, unknown>).messages
    } else if (chat.messages) {
      messages = chat.messages
    }
  }
  const arr: unknown[] | null = Array.isArray(messages)
    ? messages
    : messages && typeof messages === 'object'
      ? Object.values(messages as Record<string, unknown>)
      : null
  if (!arr) return []
  // The map is UNORDERED and `timestamp` restores the dialogue order. The
  // value is a NUMBER or a numeric string in the builds seen so far, but an
  // ISO stamp (`2026-10-23T10:00:00Z`) makes `Number(...)` NaN, and a NaN
  // comparator keeps the INSERTION order — a scrambled dialogue. Fall back to
  // Date.parse for a non-numeric string.
  const stampOf = (m: Record<string, unknown>): number => {
    const raw = m.timestamp
    const n = Number(raw)
    if (Number.isFinite(n) && n !== 0) return n
    if (typeof raw === 'string') {
      const t = Date.parse(raw)
      if (Number.isFinite(t)) return t
    }
    return 0
  }
  const sorted = arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    // Order by INSERTION INDEX first and by stamp only when BOTH messages
    // carry one. `stampOf` answers 0 for a missing stamp, so a half-stamped
    // payload pushed every undated turn BEFORE all dated ones and the dialogue
    // came back as "the model answered before it was asked".
    .map((m, i) => ({ m, i, t: stampOf(m) }))
    .sort((a, b) => {
      const da = a.t !== 0
      const db = b.t !== 0
      if (da && db && a.t !== b.t) return a.t - b.t
      return a.i - b.i
    })
    .map((x) => x.m)
  const out: ChatMessage[] = []
  for (const m of sorted) {
    // The role comes from `role` (confirmed by the live fixture). Only the
    // values the API actually uses are matched: a numeric flag or a `from`
    // field was never observed on z.ai and guessing at it would silently
    // re-attribute turns.
    const roleStr = String(m.role ?? '').toLowerCase()
    // A SYSTEM/TOOL turn is neither the operator nor the model's answer: z.ai's
    // own system prompt and the sandbox output of its agent runtime used to be
    // restored as model REPLIES (the Qwen parser drops those roles too).
    if (/^(system|tool)$/.test(roleStr)) continue
    const isUser = roleStr === 'user' || roleStr === 'human'
    const role: ChatMessage['role'] = isUser ? 'user' : 'assistant'
    let text = ''
    if (typeof m.content === 'string') text = m.content
    else if (typeof m.text === 'string') text = m.text
    // `fragments` is the DeepSeek-style payload (kept as a safety net for a
    // build that reuses it): REQUEST is the user turn, RESPONSE the answer.
    else if (Array.isArray(m.fragments)) {
      const want = role === 'assistant' ? 'RESPONSE' : 'REQUEST'
      for (const fr of m.fragments as Array<Record<string, unknown>>) {
        // Case-insensitive, like the DeepSeek parser: a payload spelling the
        // fragment type `response`/`request` used to contribute nothing.
        if (
          fr &&
          String(fr.type ?? '').toUpperCase() === want &&
          typeof fr.content === 'string'
        ) {
          text += fr.content
        }
      }
    }
    // `content_list` (phase-split output) is used when `content` is empty; the
    // reasoning phase must never leak into the restored dialogue as the answer.
    if (!text && Array.isArray(m.content_list)) {
      for (const part of m.content_list as Array<Record<string, unknown>>) {
        if (!part || typeof part.content !== 'string') continue
        const phase = String(part.phase ?? part.type ?? '')
        if (/think|reason/i.test(phase)) continue
        text += part.content
      }
    }
    text = text.trim()
    if (text) out.push({ role, text })
  }
  return out
}
