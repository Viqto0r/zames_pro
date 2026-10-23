// Extraction of the RAW model answer from z.ai's (GLM) network data.
//
// The DOM distorts the answer (markdown/LaTeX/link auto-detection), so —
// exactly like DeepSeek (net-capture.ts) and Qwen (qwen-net-capture.ts) — the
// answer the agent consumes is parsed from the intercepted SSE stream.
//
// The live shape (verified against a signed-in session, see
// test/fixtures/glm/answer-simple.sse):
//
//   data: {"type":"chat:completion","data":{"delta_content":"...","phase":"thinking"}}
//   data: {"type":"chat:completion","data":{"phase":"other","usage":{prompt_tokens,...}}}
//   data: {"type":"chat:completion","data":{"delta_content":"PONG","phase":"answer"}}
//   data: {"type":"chat:completion","data":{"phase":"done","done":true}}
//
// Other phases observed in a real stream and what they mean for the agent:
//   thinking      - the reasoning chain; NEVER part of the answer
//   tool_call     - z.ai's OWN tool call (delta_name/delta_arguments); z.ai
//                   runs it in its sandbox and sends back tool_response. This
//                   is NOT the zames protocol - the agent must not see it as
//                   an answer either, so the provider disables that runtime
//                   (preview_mode/agent flags, see glm-ui.ts) and this parser
//                   skips the phase.
//   tool_response - the sandbox output of the step above
//   answer        - the answer text (concatenated)
//   done          - the terminal chunk
//
// `usage.prompt_tokens` is the closest thing z.ai exposes to "used context"
// (there is no accumulated_token_usage like DeepSeek's).

const NL = String.fromCharCode(10)

interface SseLine {
  [k: string]: unknown
}

function parseDataLines(body: string): SseLine[] {
  const out: SseLine[] = []
  for (const line of String(body || '').split(NL)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const obj = JSON.parse(payload)
      if (obj && typeof obj === 'object') out.push(obj as SseLine)
    } catch {}
  }
  return out
}

/** The `data` object of a `chat:completion` chunk (the live envelope). */
function completionData(obj: SseLine): Record<string, unknown> | null {
  if (obj.type !== 'chat:completion') return null
  const d = obj.data
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : null
}

/** True when the chunk belongs to a non-answer phase (reasoning/tools). */
function isNonAnswerPhase(phase: unknown): boolean {
  if (typeof phase !== 'string') return false
  return /think|tool|reason/i.test(phase)
}

/**
 * Assemble the answer text from the GLM SSE stream. Only chunks whose phase
 * is exactly `answer` contribute: the reasoning (`thinking`) and z.ai's own
 * tool traffic (`tool_call` / `tool_response`) must never leak into the
 * answer, or the agent would treat them as a command.
 *
 * An OpenAI-compatible `choices[].delta.content` shape is also accepted as a
 * safety net (the same fallback Qwen's parser has).
 */
export function extractFromSse(body: string): string {
  let out = ''
  for (const obj of parseDataLines(body)) {
    const d = completionData(obj)
    if (d) {
      const phase = d.phase
      if (typeof phase === 'string' && phase !== 'answer') continue
      const content = d.delta_content
      if (typeof content === 'string' && content) out += content
      continue
    }
    // OpenAI-compatible fallback.
    const choices = (obj as Record<string, unknown>).choices
    if (!Array.isArray(choices)) continue
    for (const ch of choices) {
      if (!ch || typeof ch !== 'object') continue
      const c = ch as Record<string, unknown>
      const delta =
        c.delta && typeof c.delta === 'object'
          ? (c.delta as Record<string, unknown>)
          : c.message && typeof c.message === 'object'
            ? (c.message as Record<string, unknown>)
            : null
      if (!delta) continue
      if (isNonAnswerPhase(delta.phase)) continue
      if (typeof delta.content === 'string' && delta.content) {
        out += delta.content
      }
    }
  }
  return out
}

/** A plain JSON body (a non-streamed response): pick the answer only. */
export function extractFromJson(body: string): string {
  let obj: unknown
  try {
    obj = JSON.parse(body)
  } catch {
    return ''
  }
  return pickAnswer(obj)
}

function pickAnswer(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(pickAnswer).join('')
  if (typeof node !== 'object') return ''
  const obj = node as Record<string, unknown>
  if (typeof obj.phase === 'string' && obj.phase !== 'answer') {
    return ''
  }
  if (typeof obj.delta_content === 'string') return obj.delta_content
  // A non-streamed reply carries the SAME `chat:completion` envelope as the
  // SSE stream: the answer lives in `data.delta_content`, so the envelope must
  // be unwrapped or the whole reply reads as empty.
  if (obj.data && typeof obj.data === 'object') {
    const inner = pickAnswer(obj.data)
    if (inner) return inner
  }
  if (Array.isArray(obj.choices)) {
    let out = ''
    for (const ch of obj.choices) {
      if (!ch || typeof ch !== 'object') continue
      const c = ch as Record<string, unknown>
      const delta =
        c.delta && typeof c.delta === 'object'
          ? (c.delta as Record<string, unknown>)
          : c.message && typeof c.message === 'object'
            ? (c.message as Record<string, unknown>)
            : c
      if (isNonAnswerPhase((delta as Record<string, unknown>).phase)) continue
      const content = (delta as Record<string, unknown>).content
      if (typeof content === 'string') out += content
    }
    if (out) return out
  }
  for (const key of ['content', 'text', 'answer']) {
    const v = obj[key]
    if (typeof v === 'string' && v) return v
  }
  return ''
}

/** A universal attempt: first SSE, then regular JSON. */
export function extractAnswer(body: string): string {
  const sse = extractFromSse(body)
  if (sse) return sse
  return extractFromJson(body)
}

/** A usable token count: a FINITE NON-NEGATIVE number. */
function isUsageCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}
/**
 * The CONTEXT size (tokens) from `usage.prompt_tokens` - the prompt size for
 * the turn, the same idea as DeepSeek's accumulated_token_usage. Falls back to
 * `total_tokens`. Null when the body carries no usage.
 */
export function extractTokenUsage(body: string): number | null {
  let lastPrompt: number | null = null
  let lastTotal: number | null = null
  for (const obj of parseDataLines(body)) {
    const d = completionData(obj)
    const usage = d ? d.usage : (obj as Record<string, unknown>).usage
    if (!usage || typeof usage !== 'object') continue
    const u = usage as Record<string, unknown>
    // A token count is a FINITE NON-NEGATIVE number. A negative payload (a
    // nonsense reply, or a wrapped `int` in a proxy build) used to become
    // `browser._lastTokenUsage` as-is: the context badge disappeared
    // (tokenStatusLevel rejects it) while the auto-compact percentage went
    // negative and never fired. Treat it as "no usage", like a non-number.
    if (isUsageCount(u.prompt_tokens)) lastPrompt = u.prompt_tokens
    if (isUsageCount(u.total_tokens)) lastTotal = u.total_tokens
  }
  if (lastPrompt !== null) return lastPrompt
  if (lastTotal !== null) return lastTotal
  try {
    const obj = JSON.parse(body) as Record<string, unknown>
    // A non-streamed reply keeps `usage` inside the same `chat:completion`
    // envelope as the SSE stream (`data.usage`); reading only the top level
    // lost the counter entirely.
    const envelope =
      obj?.data && typeof obj.data === 'object'
        ? (obj.data as Record<string, unknown>)
        : null
    const usage = ((envelope ? envelope.usage : undefined) ?? obj?.usage) as
      Record<string, unknown> | undefined
    if (usage) {
      if (isUsageCount(usage.prompt_tokens)) return usage.prompt_tokens
      if (isUsageCount(usage.total_tokens)) return usage.total_tokens
    }
  } catch {}
  return null
}

/** True when a chunk marks the end of the stream (`done: true`). */
export function isDoneChunk(obj: SseLine): boolean {
  const d = completionData(obj)
  if (!d) return false
  return d.done === true || d.phase === 'done'
}

/**
 * True when the stream ENDED with no answer content - the model finished with
 * only reasoning (or only z.ai's own tool traffic). The caller then retries
 * instead of waiting out the whole timeout. Mirrors Qwen's
 * isFinishedWithoutAnswer.
 */
export function isFinishedWithoutAnswer(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  let finished = false
  for (const obj of parseDataLines(b)) {
    if (isDoneChunk(obj)) finished = true
  }
  if (!finished) return false
  return extractFromSse(b) === ''
}

/** True when the body carries actual answer text in a chunk. */
function hasAnswerContent(body: string): boolean {
  for (const obj of parseDataLines(body)) {
    const d = completionData(obj)
    if (d && d.phase === 'answer') {
      if (typeof d.delta_content === 'string' && d.delta_content.trim()) {
        return true
      }
    }
    const choices = (obj as Record<string, unknown>).choices
    if (!Array.isArray(choices)) continue
    for (const ch of choices) {
      if (!ch || typeof ch !== 'object') continue
      const c = ch as Record<string, unknown>
      const delta = c.delta as Record<string, unknown> | undefined
      if (!delta || isNonAnswerPhase(delta.phase)) continue
      if (typeof delta.content === 'string' && delta.content.trim()) return true
    }
  }
  return false
}

// The classifiers below run against the RAW body, so a phrase like `please try
// again later` would also match a NORMAL answer (the model explaining retry
// logic) and make ask() back off on a good turn. A real notice arrives in an
// ERROR payload (`type: "error"` / a code) or as a bare notice with NO answer
// content; answer text lives in `phase: "answer"` chunks.
const ERROR_PAYLOAD_RE = /"type"\s*:\s*"error"|"error"\s*:|\{\s*"code"\s*:/i

/** True when the RAW body is z.ai's rate-limit notice. */
/**
 * True when z.ai answers that the ACCOUNT quota is exhausted
 * (`insufficient_quota`, HTTP 429). Distinct from a transient rate limit:
 * it does not clear in minutes, so ask() must fail at once with a clear
 * message instead of retrying for the whole budget.
 */
export function isQuotaExhaustedText(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  // Same guard as every other z.ai classifier: a normal ANSWER may legitimately
  // discuss `insufficient_quota` / "exceeded your current quota" (the operator
  // asked how to handle that API error). Without this the answer was taken for
  // a refusal and a good turn was abandoned with `glm.quota_exhausted`.
  if (!ERROR_PAYLOAD_RE.test(b) && hasAnswerContent(b)) return false
  return /insufficient_quota|quota (?:exceeded|exhausted)|exceeded your current quota/i.test(
    b,
  )
}

export function isRateLimitText(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  if (/"code"\s*:\s*"(?:rate_limit|quota_limit)"/i.test(b)) return true
  if (!ERROR_PAYLOAD_RE.test(b) && hasAnswerContent(b)) return false
  // A generic "please try again later" belongs to the BUSY family; a rate
  // limit has its own wording (or a code matched above).
  return /too many requests|rate limit|too frequent|high demand|слишком часто/i.test(
    b,
  )
}

/** True when the RAW body is a transient server-busy notice. */
export function isServerBusyText(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  if (isRateLimitText(b)) return false
  if (!ERROR_PAYLOAD_RE.test(b) && hasAnswerContent(b)) return false
  return /server is busy|service unavailable|please try again later|high demand/i.test(
    b,
  )
}

/**
 * True when the site says the GUEST quota is over. It cannot be waited out
 * (it needs a login), so ask() fails fast with a "sign in" message instead of
 * burning the retry budget.
 */
export function isGuestLimitText(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  // A chat-create response contains the OLD guest email (`guest-123@guest.com`)
  // and the word `guest` in the chat id/title. A SIGNED-IN session therefore
  // looked like a guest limit (a real false positive: the operator was told
  // "working as a guest" while the session was active). The notice must be an
  // ERROR payload or an EXPLICIT limit sentence, never a bare `guest` word.
  const explicit =
    /guest (?:chat |daily |usage )?limit|reached the guest|log ?in to continue|sign ?in to continue|гостевой лимит/i.test(
      b,
    )
  if (!explicit) return false
  if (!ERROR_PAYLOAD_RE.test(b) && hasAnswerContent(b)) return false
  return true
}

/**
 * True when the raw body is z.ai's Aliyun captcha challenge. The site answers
 * a POST with a "security verification" page instead of a stream, which the
 * agent cannot solve - the operator must sign in in the browser window.
 */
export function isCaptchaText(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  const hit = /security verification|drag the slider|CertifyId/i.test(b)
  if (!hit) return false
  // The SAME body may be the answer SSE stream (this classifier runs on every
  // response). An answer that merely MENTIONS the captcha must not be taken
  // for the challenge page: an error payload or a body WITHOUT answer text
  // only (same rule as the rate-limit / guest classifiers).
  if (!ERROR_PAYLOAD_RE.test(b) && hasAnswerContent(b)) return false
  return true
}

/**
 * Read the chat id off the RAW body (the chat list / history JSON carries it as
 * `id`, and an SSE chunk may echo `chat_id`).
 */
export function extractChatId(body: string): string | null {
  const b = String(body || '')
  if (!b) return null
  const m1 = b.match(/"chat_id"\s*:\s*"([0-9a-f-]{36})"/i)
  if (m1) return m1[1]
  const m2 = b.match(
    /"id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i,
  )
  return m2 ? m2[1] : null
}

/**
 * True when the RAW body says the chat's CONTEXT WINDOW is exhausted - the
 * same hard failure as DeepSeek's length limit: every further send into that
 * chat is refused, so the only recovery is a compaction into a fresh chat.
 *
 * Same guard as the other z.ai classifiers: the notice must be an ERROR
 * payload (or carry no answer text). The model can legitimately WRITE about
 * context limits, and treating such an answer as a refusal loses a good turn.
 */
export function isContextLimitText(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  const explicit =
    /context (?:length|window) (?:is )?(?:exceeded|too long|limit)|maximum context length|exceeds? the (?:maximum |model'?s )?context|too many (?:input )?tokens|length limit (?:has been )?reached|start a new (?:chat|conversation)|лимит длин|превышен[ао]? (?:максимальн[аяу]? )?(?:длина|контекст)|начните новый чат/i.test(
      b,
    )
  if (!explicit) return false
  if (!ERROR_PAYLOAD_RE.test(b) && hasAnswerContent(b)) return false
  return true
}
