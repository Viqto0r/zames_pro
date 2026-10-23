// Extraction of the RAW model answer from Qwen Chat's (chat.qwen.ai) network
// data. The DOM distorts the answer (markdown/LaTeX/link auto-detection), so
// — exactly like the DeepSeek path (net-capture.ts) — the answer the agent
// consumes is parsed from the intercepted SSE stream instead of the rendered
// page.
//
// Qwen's completions stream (POST /api/v2/chat/completions?chat_id=...):
//   data: {"response.created": {chat_id, response_id, ...}}
//   data: {"response.info": {"action": "keep_alive", ...}}
//   data: {"choices":[{"delta":{"role":"assistant","content":"",
//                            "phase":"thinking_summary","extra":{...}},
//                       "status":"typing"}], "usage":{...}}
//   data: {"choices":[{"delta":{"role":"assistant","content":"PONG",
//                            "phase":"answer","status":"typing"}}], ...}
//   data: {"choices":[{"delta":{"content":"","role":"assistant",
//                            "status":"finished","phase":"answer"}}]}
//
// The answer text is the concatenation of delta.content chunks whose
// `phase` is NOT the reasoning phase (`thinking_summary`). Reasoning must
// never leak into the answer (same rule as DeepSeek's THINK fragments).
//
// `usage` carries input_tokens/output_tokens/total_tokens — the closest thing
// Qwen exposes to "used context" (there is no accumulated_token_usage).

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

// True when a delta chunk is part of the reasoning (thinking) phase, which is
// NOT the answer.
function isThinkingPhase(delta: Record<string, unknown>): boolean {
  const phase = delta.phase
  return typeof phase === 'string' && /think/i.test(phase)
}

// Assembles the answer text from the Qwen SSE stream. Also accepts an
// OpenAI-compatible shape (choices[].delta.content) as a safety net, and
// ignores reasoning_content there as well.
export function extractFromSse(body: string): string {
  let out = ''
  for (const obj of parseDataLines(body)) {
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
      if (isThinkingPhase(delta)) continue
      const content = delta.content
      if (typeof content === 'string' && content) out += content
    }
  }
  return out
}

// A plain JSON body (a non-streamed response) — pick the first string content
// that is not reasoning. Best-effort; the live stream is SSE.
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
  // A plain-JSON reply can carry the SAME phase marker as an SSE delta
  // (`thinking_summary`). The reasoning guard used to live only in the
  // choices[] branch, so a top-level `{phase:"thinking_summary",content}`
  // (or the same object one envelope deeper) was returned as the ANSWER.
  if (isThinkingPhase(obj)) return ''
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
      if (isThinkingPhase(delta as Record<string, unknown>)) continue
      const content = (delta as Record<string, unknown>).content
      if (typeof content === 'string') out += content
    }
    if (out) return out
  }
  for (const key of ['content', 'text', 'answer']) {
    const v = obj[key]
    if (typeof v === 'string' && v) return v
  }
  // A wrapper envelope (`{data:{…}}`, `{response:{…}}`) keeps the answer one
  // level deeper; without this the whole reply reads as empty.
  for (const key of ['data', 'response', 'result']) {
    const v = obj[key]
    if (v && typeof v === 'object') {
      const inner = pickAnswer(v)
      if (inner) return inner
    }
  }
  return ''
}

// A universal attempt: first SSE, then regular JSON.
export function extractAnswer(body: string): string {
  const sse = extractFromSse(body)
  if (sse) return sse
  return extractFromJson(body)
}

// The CONTEXT size (in tokens) Qwen reports in the `usage` object of the SSE
// stream. `input_tokens` is the PROMPT size for the turn — the best match for
// "how much context is used", the same idea as DeepSeek's
// accumulated_token_usage. (`total_tokens` = prompt + answer, so it inflates
// the number by the answer length; it is only the fallback when input_tokens
// is absent.) Null when the body carries no usage.
export function extractTokenUsage(body: string): number | null {
  let lastInput: number | null = null
  let lastTotal: number | null = null
  for (const obj of parseDataLines(body)) {
    const usage = (obj as Record<string, unknown>).usage
    if (!usage || typeof usage !== 'object') continue
    const u = usage as Record<string, unknown>
    if (typeof u.input_tokens === 'number' && Number.isFinite(u.input_tokens))
      lastInput = u.input_tokens
    if (typeof u.total_tokens === 'number' && Number.isFinite(u.total_tokens))
      lastTotal = u.total_tokens
  }
  if (lastInput !== null) return lastInput
  if (lastTotal !== null) return lastTotal
  // Plain JSON fallback (a non-streamed body).
  try {
    const obj = JSON.parse(body) as Record<string, unknown>
    const usage = obj?.usage as Record<string, unknown> | undefined
    if (usage) {
      if (typeof usage.input_tokens === 'number') return usage.input_tokens
      if (typeof usage.total_tokens === 'number') return usage.total_tokens
    }
  } catch {}
  return null
}

// True when the stream ENDED (a chunk with status "finished") but produced NO
// answer content — the model finished with only a reasoning summary. The
// caller then retries instead of waiting out the whole timeout. Mirrors
// DeepSeek's isFinishedWithoutAnswer.
export function isFinishedWithoutAnswer(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  let finished = false
  for (const obj of parseDataLines(b)) {
    const choices = (obj as Record<string, unknown>).choices
    if (!Array.isArray(choices)) continue
    for (const ch of choices) {
      if (!ch || typeof ch !== 'object') continue
      const c = ch as Record<string, unknown>
      // The final chunk carries `status` on the CHOICE (see the format comment
      // at the top of this file); older/other builds put it on `delta`.
      if (c.status === 'finished') finished = true
      const delta = c.delta as Record<string, unknown> | undefined
      if (delta && delta.status === 'finished') finished = true
    }
  }
  if (!finished) return false
  return extractFromSse(b) === ''
}

// True when the body carries Qwen's rate-limit / busy notice, so ask() can
// back off instead of waiting out the deadline. Matched against the RAW body.
// The classifier runs against the RAW body, so a phrase like `please try again
// later` would also match a NORMAL answer (the model writing about retry
// logic) and make ask() back off on a good turn. A real notice arrives in an
// ERROR payload (`event: error` / `"type":"error"`) or as a code; answer text
// lives in `choices[].delta.content`. We therefore only inspect the body when
// it is NOT a plain answer stream, or when it carries no answer content.
export function isRateLimitText(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  const errNotice = /event:\s*error|"type"\s*:\s*"error"|"error"\s*:/i.test(b)
  // The `quota_limit` CODE only means something in an ERROR payload: a normal
  // ANSWER may MENTION `quota_limit` (the operator asked how to handle that
  // API error), and this check used to run BEFORE the answer-content guard, so
  // such an answer made ask() back off and re-send a good turn.
  if (/quota_limit/i.test(b) && (errNotice || !hasAnswerContent(b))) return true
  if (errNotice) {
    return /too many requests|rate limit|too frequent|please try again later|high demand|слишком часто/i.test(
      b,
    )
  }
  // No structured error marker: only treat the body as a notice when it has
  // NO answer content (a bare notice page/JSON).
  if (hasAnswerContent(b)) return false
  return /too many requests|rate limit|too frequent|please try again later|high demand|слишком часто/i.test(
    b,
  )
}

// True when the body carries actual answer text in an SSE/JSON chunk.
function hasAnswerContent(body: string): boolean {
  const b = String(body || '')
  // A NON-streamed body is a single JSON object with no `data:` lines; the
  // answer may sit in a wrapper (`{data:{content}}`). Without this check the
  // answer was invisible here and a rate-limit/busy phrase elsewhere in the
  // SAME body (the model may quote the notice) made ask() back off.
  if (!b.split(NL).some((l) => l.trim().startsWith('data:'))) {
    try {
      const parsed = JSON.parse(b)
      if (pickAnswer(parsed).trim()) return true
    } catch {}
  }
  for (const obj of parseDataLines(b)) {
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
      if (isThinkingPhase(delta)) continue
      if (typeof delta.content === 'string' && delta.content.trim()) {
        return true
      }
    }
  }
  return false
}

// The GUEST daily limit is a DIFFERENT failure from a transient rate limit:
// Qwen answers `RateLimited` with "You've reached the guest chat limit for
// today's usage. Log in to continue." Retrying after `rateLimitWaitMs` cannot
// help (it resets the next day); the operator must sign in. Detected from the
// raw body so ask() can fail fast with a clear "log in" message instead of
// burning the whole retry budget.
export function isGuestLimitText(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  // Same rule as isRateLimitText / isServerBusyText: a normal ANSWER may
  // MENTION the guest limit (the model explaining Qwen's guest mode, a pasted
  // notice). Only an error payload or a body with NO answer content can be the
  // real notice; otherwise ask() would fail fast with "log in" and throw the
  // answer away.
  const errNotice = /event:\s*error|"type"\s*:\s*"error"|"error"\s*:/i.test(b)
  if (!errNotice && hasAnswerContent(b)) return false
  return /guest chat limit|guest.*limit|log in to continue|гостевой лимит/i.test(
    b,
  )
}

export function isServerBusyText(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  // Same rule as isRateLimitText: a normal ANSWER may mention "try again
  // later"; only a structured error payload or a body with NO answer content
  // can be a server-busy notice.
  const errNotice = /event:\s*error|"type"\s*:\s*"error"|"error"\s*:/i.test(b)
  if (!errNotice && hasAnswerContent(b)) return false
  return /server is busy|service unavailable|try again later/i.test(b)
}

// The chat's CONTEXT WINDOW is exhausted. Qwen refuses the turn and no retry
// in the same chat can succeed - the only way out is a compaction into a
// fresh chat. Same guard as the other classifiers: the notice must be an
// error payload or a body with NO answer content, because the model can
// legitimately WRITE about context limits and treating that answer as a
// refusal would lose a good turn.
export function isContextLimitText(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  const explicit =
    /context (?:length|window) (?:is )?(?:exceeded|too long|limit)|maximum context length|exceeds? the (?:maximum |model'?s )?context|too many (?:input )?tokens|length limit (?:has been )?reached|start a new (?:chat|conversation)|лимит длин|превышен[ао]? (?:максимальн[аяу]? )?(?:длина|контекст)|начните новый чат/i.test(
      b,
    )
  if (!explicit) return false
  const errNotice = /event:\s*error|"type"\s*:\s*"error"|"error"\s*:/i.test(b)
  if (!errNotice && hasAnswerContent(b)) return false
  return true
}
