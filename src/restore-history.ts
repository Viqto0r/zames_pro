// The RESTORED-DIALOGUE layer: what the operator sees when a chat is
// reopened (/resume, /resume-id, startup). Every provider's stored history is
// raw protocol text — the system prompt, tool results, tool-call JSON, the
// model's safety block — so a restore must KEEP only the operator's own turns
// and the agent's `respond` message. The formatting used to live inside the
// DeepSeek DOM scraper, which is why only DeepSeek produced a readable
// dialogue: Qwen/GLM store the SAME raw text through the same endpoints, so
// normalization and truncation moved HERE, where every provider shares them.
import { parseToolCall } from './answer-parse.js'
import type { ChatMessage } from './browser.js'

const NL = String.fromCharCode(10)

/** One message of a restored chat, as read from the DeepSeek DOM/API. */
export interface RestoredMessage {
  role: 'user' | 'assistant'
  text: string
}

/** How many messages of the dialogue are printed by default. */
export const RESTORED_HISTORY_LIMIT = 20

/**
 * Longest restored message KEPT for display. The system prompt (leaked into
 * history) is far bigger and is filtered by the noise checks below; a real
 * answer above this size is shortened instead of being dropped.
 */
const RESTORED_MESSAGE_MAX = 100_000

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
    // The value is not a quoted string (a number, a boolean, an array, a
    // nested object): there is no operator-facing MESSAGE here. The old
    // fallback sliced the raw text from the key and the restored turn printed
    // `:42}}` / `:[1,2]}}` as if it were the model's answer.
    const value = t.slice(t.indexOf('"message"') + 9).replace(/^\s*:\s*/, '')
    if (!value.startsWith('"')) return { tool, message: '' }
    raw = value.replace(/^"/, '')
  }
  return { tool, message: unescapeJsonString(raw) }
}

/** Decode the JSON escape sequences that appear inside a captured string. */
export function unescapeJsonString(s: string): string {
  // A `\uD800`-style escape that is NOT followed by a low surrogate (a
  // truncated or hand-written payload) would become a LONE surrogate - a
  // broken code point the restored dialogue prints as `?`. Decode a valid PAIR
  // as one code point and drop an unpaired half.
  let pendingHigh = ''
  return String(s || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_x, h: string) => {
      const cp = parseInt(h, 16)
      if (cp >= 0xd800 && cp <= 0xdbff) {
        pendingHigh = String.fromCharCode(cp)
        return ''
      }
      if (cp >= 0xdc00 && cp <= 0xdfff) {
        const high = pendingHigh
        pendingHigh = ''
        return high ? high + String.fromCharCode(cp) : ''
      }
      pendingHigh = ''
      return String.fromCharCode(cp)
    })
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
  let text = String((m && m.text) || '').trim()
  if (!text) return null
  // The size cap exists to keep a leaked SYSTEM PROMPT (or another giant
  // protocol blob) out of the restored dialogue. It must NOT drop a real
  // answer: a long report/diff/document easily exceeds the cap, and dropping
  // it silently left the operator with a dialogue where the agent's own reply
  // was missing. Keep such a message but shorten it for display.
  if (text.length > RESTORED_MESSAGE_MAX) {
    // Never split a surrogate PAIR: the cut is in UTF-16 units, so a high half
    // alone would reach the terminal as a broken code point (same rule as
    // truncateToolResult / capReport / cutHookText).
    let cut = RESTORED_MESSAGE_MAX
    const last = text.charCodeAt(cut - 1)
    if (last >= 0xd800 && last <= 0xdbff) cut--
    text = text.slice(0, cut) + '…'
  }
  if (m.role === 'user') {
    if (/^Tool result for /.test(text)) return null
    if (/^You are a coding agent running in a terminal/.test(text)) return null
    if (/^You stopped after a tool result/.test(text)) return null
    // The agent loop's own watchdog nudge is protocol noise written by US, not
    // by the operator: when an answer timed out the loop resends this text as
    // the "user" message. It used to leak into the restored dialogue (a dozen
    // copies after a flaky run), so drop it like the other nudges.
    if (/^The previous turn was cut off/.test(text)) return null
    if (/^\[system\]/.test(text)) return null
    if (/^The user ran \//.test(text)) return null
    // `/compact` posts its summary as a USER turn, prefixed with a marker the
    // loop writes (not the operator): a restored dialogue should show the
    // TASK, not the mechanical handover.
    if (/^Compact the conversation so far/.test(text)) return null
    if (/^This is the handover summary/.test(text)) return null
    const stripped = stripUserFraming(text)
    if (!stripped) return null
    return { role: 'user', text: stripped }
  }
  // Reasoning is UI state, not the answer.
  text = stripThinkBlocks(text)
  if (!text) return null
  // Only a real DSML MARKER is protocol noise: a bare mention of the feature
  // (an answer explaining the DSML parser) is a normal reply.
  if (/[<｜]\s*DSML\s*[>｜]/i.test(text)) return null
  if (/^<system>/i.test(text)) return null
  // The model sometimes emits its own safety-classification block as a plain
  // "answer"; it is not for the operator.
  if (/<ds_safety>/i.test(text)) return null
  if (/^Safe$/i.test(text)) return null
  // EVERY format the parser knows, not just the legacy `{"tool":...}` head.
  const generic = toolCallOf(text)
  if (generic) {
    if (generic.tool !== 'respond') return null
    const msg = (generic.message || '').trim()
    if (!msg) return null
    if (/<\/?ds_safety\b/i.test(msg)) return null
    return { role: 'assistant', text: msg }
  }
  const legacy = parseAssistantToolCall(text)
  if (legacy) {
    if (legacy.tool !== 'respond') return null
    const msg = (legacy.message || '').trim()
    if (!msg) return null
    if (/<\/?ds_safety\b/i.test(msg)) return null
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
  messages: (RestoredMessage | { role?: string; text?: unknown })[],
  limit = RESTORED_HISTORY_LIMIT,
): RestoredMessage[] {
  const clean: RestoredMessage[] = []
  for (const m of messages || []) {
    if (!m || typeof m.text !== 'string') continue
    const n = normalizeRestoredMessage({
      role: m.role === 'user' ? 'user' : 'assistant',
      text: String(m.text),
    })
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

/**
 * Remove the reasoning a provider renders INTO the message text.
 *
 * Qwen/GLM expose the THINK phase as part of the turn, and a DeepSeek DOM
 * scrape keeps the collapsible "Thought for N seconds" header after the
 * reasoning subtree is stripped. Reasoning is NOT the answer, so a restored
 * dialogue must not show it.
 */
export function stripThinkBlocks(text: string): string {
  let t = String(text || '')
  // A fenced or tagged reasoning block, the shape every provider uses when it
  // stores the phase inline.
  t = t.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>\s*/gi, '')
  t = t.replace(/```(?:think|thinking|reasoning)\s*[\s\S]*?```\s*/gi, '')
  // "Thought for 1 second" / "Think for 12s" — a header LINE. Live DOM
  // scrape: the header, then the answer ("Thought for 1 second" + NEWLINE +
  // "OK2"); the reasoning BODY was already removed with its subtree.
  // A single newline: with the blank-line form the `[\s\S]*?` below ate
  // the whole answer and the restored turn vanished.
  t = t.replace(/^\s*(?:thought|thinking|think)\s+for\s+[^\n]*\n?/i, '')
  // The DOM may hand the header WITHOUT its newline ("Thought for 1
  // secondOK2"): drop the header up to the first non-space run only when a
  // line break or the end of the text follows it.
  return t.trim()
}

/**
 * Drop a provider's OWN framing from a user turn so the restored dialogue
 * shows the operator's words: DeepSeek stores "You are a coding agent ..." as a
 * USER message and prefixes a task with `<system>...</system>`.
 */
export function stripUserFraming(text: string): string {
  let t = String(text || '')
  for (let i = 0; i < 3; i++) {
    const next = t.replace(/^\s*<system>[\s\S]*?<\/system>\s*/i, '')
    if (next === t) break
    t = next
  }
  return t.trim()
}

/**
 * A turn that is a TOOL CALL (any provider, any format the parser knows) is
 * protocol noise in the restored dialogue, EXCEPT a `respond` call, whose
 * message is the agent's real answer.
 *
 * Returns the call when it is one, `null` otherwise, and the operator-facing
 * message for a `respond`.
 */
export function toolCallOf(text: string): {
  tool: string
  message?: string
} | null {
  const t = String(text || '').trim()
  if (!t) return null
  // A real call starts with a bracket, a marker or the `tool` key; the strict
  // parser is only consulted then, so ordinary prose is never re-parsed (and a
  // bare "tool:" inside a report does not turn the report into a call).
  if (!/^[\s\[\{<]/.test(t) && !/tool"?\s*:/.test(t.slice(0, 200))) {
    return null
  }
  let calls: Array<{ tool: string; args?: Record<string, unknown> }> = []
  try {
    const parsed = parseToolCall(t)
    calls = (
      Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    ) as typeof calls
  } catch {
    return null
  }
  if (!calls.length) return null
  const first = calls[0]
  if (first.tool === 'respond') {
    const msg = first.args?.message
    return { tool: 'respond', message: typeof msg === 'string' ? msg : '' }
  }
  return { tool: first.tool }
}

/** Convert a provider history to the shared restored-message shape. */
export function toRestoredMessages(
  messages: Array<ChatMessage | RestoredMessage> | null | undefined,
): RestoredMessage[] {
  const out: RestoredMessage[] = []
  for (const m of messages || []) {
    if (!m || typeof m.text !== 'string') continue
    const role = m.role === 'user' ? 'user' : 'assistant'
    out.push({ role, text: m.text })
  }
  return out
}
