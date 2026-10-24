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
/**
 * Unwrap the list out of its wrappers: `{chats:[…]}`, `{list:{page,data:[…]}}`.
 * A paginated reply nests the wrapper INSIDE the wrapper, and treating that
 * inner object as an id-keyed map made its own key (`'data'`, `'list'`) look
 * like a chat id. A plain id-keyed map (no known wrapper key) is returned
 * as-is, because that is a legitimate shape too.
 */
function unwrapChatList(data: unknown): unknown {
  let cur = data
  for (let depth = 0; depth < 3; depth++) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return cur
    const o = cur as Record<string, unknown>
    const inner = o.chats ?? o.list ?? o.items ?? o.data
    if (inner === undefined) return cur
    cur = inner
  }
  return cur
}

export function parseQwenChatList(json: unknown): ChatInfo[] {
  const root = json as { data?: unknown } | null
  // A BARE array (no `data` wrapper) is the simplest shape the endpoint can
  // return and the GLM parser already accepts it: reading only `root.data`
  // made /chats print "(none)" for a valid list.
  const data =
    Array.isArray(json) || root === null || typeof root !== 'object'
      ? json
      : root.data
  const arr: unknown = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? // A bare map keyed by chat id (the same convention as the history
        // shape) has no `chats`/`list`/`items` wrapper: without this fallback
        // a legitimate list was rejected and /chats printed "(none)".
        unwrapChatList(data)
      : null
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
  // A payload may list the SAME chat twice (a merged page, an optimistic
  // entry). /chats would then show it twice and resuming the second row opens
  // the same chat — keep the first occurrence only.
  const seenIds = new Set<string>()
  for (const [key, c] of entries) {
    if (!c || typeof c !== 'object') continue
    const m = c as Record<string, unknown>
    // A numeric id (`{id: 12345}`) used to be dropped as "no id"; it is a
    // perfectly usable chat id once stringified.
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
 * Parse one chat's history from `GET /api/v2/chats/<id>?direction=up&limit=N`.
 * Accepts the plausible shapes:
 *   { data: { messages: [...] } }, { data: { chat: { messages } } }, { data: [...] }.
 * A message's text is taken from `content` (string) or from `fragments[]`
 * (a DeepSeek-style payload: keep REQUEST for user, RESPONSE for assistant).
 */
export function parseQwenHistory(json: unknown): ChatMessage[] {
  const root = json as { data?: unknown; messages?: unknown } | null
  // A BARE array (no `data` wrapper) and a top-level `messages` are the same
  // simple shapes the chat-LIST endpoint returns: reading only `root.data`
  // made /resume print nothing for a payload that DID carry the dialogue.
  const data =
    Array.isArray(json) || root === null || typeof root !== 'object'
      ? json
      : (root.data ?? (root.messages ? { messages: root.messages } : null))
  // The REAL shape (verified live) is a MAP, not an array:
  //   data.chat.history.messages = { <id>: { role, content, timestamp, ... } }
  // An array is accepted too (older shape).
  let arr: unknown[] | null = null
  const asArr = (v: unknown): unknown[] | null =>
    Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : null
  if (Array.isArray(data)) arr = data
  else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (d.messages) arr = asArr(d.messages)
    else if (d.chat && typeof d.chat === 'object') {
      const chat = d.chat as Record<string, unknown>
      // `history` may itself be the message LIST (an array), not only an
      // object with a `messages` field: the array form was read as
      // `history.messages` -> undefined and the whole restored dialogue came
      // back EMPTY even though the payload carried it.
      const hist = chat.history
      if (Array.isArray(hist)) arr = hist
      else if (hist && typeof hist === 'object') {
        const h = hist as Record<string, unknown>
        if (h.messages) arr = asArr(h.messages)
      }
      if (!arr && chat.messages) arr = asArr(chat.messages)
    }
  }
  if (!arr) return []
  // The map is UNORDERED; `timestamp` (seconds) restores the dialogue order.
  const sorted = arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    // A message WITHOUT a usable timestamp must not be forced to 0: that put
    // it BEFORE every dated turn, so a partially stamped payload reordered the
    // dialogue (the operator's question surfaced after the model's answer).
    // Order by index first — the map is in insertion order — and only then by
    // stamp; a missing stamp inherits its neighbour's position instead of
    // jumping to the front. A stable sort keeps the original order on a tie.
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ta = Number(a.m.timestamp)
      const tb = Number(b.m.timestamp)
      const va = Number.isFinite(ta) ? ta : NaN
      const vb = Number.isFinite(tb) ? tb : NaN
      if (Number.isFinite(va) && Number.isFinite(vb)) {
        if (va !== vb) return va - vb
        return a.i - b.i
      }
      // Only ONE side is dated: keep the insertion order (a half-stamped
      // payload has no trustworthy clock to sort by).
      return a.i - b.i
    })
    .map((x) => x.m)
  const out: ChatMessage[] = []
  for (const m of sorted) {
    // Role detection is DEFENSIVE: the field has been `role` (string,
    // case-insensitive), a NUMERIC flag, or `is_user`. Anything that is not
    // clearly the user is treated as the assistant (the restored dialogue
    // cares about the distinction, not the exact enum). A numeric flag uses
    // 1 = user, 2 = assistant (the `String(1) === '1'` form was ignored and
    // every user turn was attributed to the model).
    const roleStr = String(m.role ?? '').toLowerCase()
    // `from` is matched case-insensitively and accepts Qwen's `human`
    // spelling: the exact `from === 'user'` test read an uppercase/human
    // turn as the ASSISTANT's answer, so the operator's own question was
    // restored as the model's reply.
    const fromStr = String(m.from ?? '').toLowerCase()
    const isUser =
      roleStr === 'user' ||
      roleStr === '1' ||
      roleStr === '0' ||
      m.is_user === true ||
      fromStr === 'user' ||
      fromStr === 'human'
    // A SYSTEM/TOOL turn is neither the operator nor the model's answer: on
    // Qwen the system prompt is a message of its own, and mapping it to
    // ASSISTANT printed it as a model reply in the restored dialogue. DeepSeek's
    // parser drops those roles too.
    if (/^(system|tool)$/.test(roleStr) || /^(system|tool)$/.test(fromStr)) {
      continue
    }
    const role: ChatMessage['role'] = isUser ? 'user' : 'assistant'
    let text = ''
    if (typeof m.content === 'string') text = m.content
    else if (typeof m.text === 'string') text = m.text
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
    // `content_list` (phase-split output) is used when `content` is empty.
    // Each part carries its PHASE, and the reasoning phase must never leak
    // into the restored dialogue as the answer (the live SSE parser skips
    // `thinking_summary` for the same reason).
    if (!text && Array.isArray(m.content_list)) {
      for (const part of m.content_list as Array<Record<string, unknown>>) {
        if (!part || typeof part.content !== 'string') continue
        const phase = String(part.phase ?? part.type ?? '')
        if (/think|reason/i.test(phase)) continue
        text += part.content
      }
    }
    // `reasoning_content` is the THINK phase and must never leak into the
    // restored dialogue as the answer.
    text = text.trim()
    if (text) out.push({ role, text })
  }
  return out
}
