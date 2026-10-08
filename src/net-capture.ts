import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { FINISHED_STATUS_RE, RESPONSE_CONTENT_RE } from './deepseek-ui.js'

// Extraction of the RAW model answer text from DeepSeek's network data.
//
// Why: the answer is read from the RENDERED DOM, and DeepSeek's rendering
// distorts the answer — it turns dollar formulas into LaTeX (the dollar sign
// is lost), normalizes newlines, and auto-links. Because of this a tool-call
// with template strings and escaped newlines in its arguments reached the
// tools distorted. Here we extract the original text from the network
// response body.
//
// Format DeepSeek (SSE, chat.deepseek.com/api/v0/chat/completion):
//   * startovy fragment otveta lezhit v data-chanke s uzlom v.response
//     (v.response.fragments[] -> type RESPONSE -> content);
//   * dalshe tekst dorashchivaetsya chankami vida
//     {"p":"response/fragments/-1/content","o":"APPEND","v":"..."};
//     u samogo pervogo APPEND est p i o, u posleduyushchikh — tolko v;
//   * status generacii prikhodit v {"p":"response/status","o":"SET","v":"..."}
//     i v {"p":"response","o":"BATCH","v":[{...quasi_status...}]}.
// Reasoning-chanki (thinking) z otvet NE popadayut.

const NL = String.fromCharCode(10)

function parseDataLines(body: string): unknown[] {
  const out: unknown[] = []
  for (const line of body.split(NL)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      out.push(JSON.parse(payload))
    } catch {}
  }
  return out
}

// Assembles the answer text from the SSE stream. Supports two formats:
//   * OpenAI-compatible: choices[].delta.content (reasoning_content
//     is ignored — that's reasoning, not the answer);
//   * DeepSeek chat.deepseek.com: the initial v.response.fragments[] and
//     incremental APPEND chunks response/fragments/-1/content.
export function extractFromSse(body: string): string {
  let out = ''
  // Type of the CURRENT last fragment. When deep thinking is on, the
  // stream first fills a THINK fragment (the reasoning) and only then a
  // RESPONSE fragment (the answer), and BOTH use the same APPEND path
  // response/fragments/-1/content. Without tracking this, the reasoning was
  // concatenated into the answer and leaked to the terminal.
  let lastType = ''
  for (const obj of parseDataLines(body)) {
    if (obj == null || typeof obj !== 'object') continue
    const o = obj as Record<string, unknown>

    // OpenAI-sovmestimyj format: choices[].delta.content.
    if (Array.isArray(o.choices)) {
      out += pickAnswerText(o)
      continue
    }

    // DeepSeek: startovy snapshot otveta v.response.fragments[].
    const v = o.v as Record<string, unknown> | undefined
    const resp =
      v && typeof v === 'object'
        ? (v.response as Record<string, unknown>)
        : undefined
    if (resp && Array.isArray(resp.fragments)) {
      const frags = resp.fragments as Record<string, unknown>[]
      for (const fr of frags) {
        if (fr && fr.type === 'RESPONSE' && typeof fr.content === 'string') {
          out += fr.content
        }
      }
      const lastFrag = frags[frags.length - 1]
      if (lastFrag && typeof lastFrag.type === 'string')
        lastType = lastFrag.type
      continue
    }

    // A NEW fragment is appended to response/fragments[]. The LAST fragment
    // decides what the following content chunks belong to (THINK vs
    // RESPONSE).
    if (o.p === 'response/fragments' && Array.isArray(o.v)) {
      const frags = o.v as Record<string, unknown>[]
      for (const fr of frags) {
        if (fr && fr.type === 'RESPONSE' && typeof fr.content === 'string') {
          out += fr.content
        }
      }
      const lastFrag = frags[frags.length - 1]
      if (lastFrag && typeof lastFrag.type === 'string')
        lastType = lastFrag.type
      continue
    }

    // Incremental APPEND: p='response/fragments/-1/content' -> v=string;
    // subsequent chunks come with a single v field. Append ONLY when the
    // current fragment is RESPONSE; a THINK fragment is the reasoning.
    if (o.p === 'response/fragments/-1/content' && typeof o.v === 'string') {
      if (lastType === '' || lastType === 'RESPONSE') out += o.v
      continue
    }
    if (o.p === undefined && typeof o.v === 'string') {
      if (lastType === '' || lastType === 'RESPONSE') out += o.v
    }
  }
  return out
}

export function extractFromJson(body: string): string {
  let obj: unknown
  try {
    obj = JSON.parse(body)
  } catch {
    return ''
  }
  return pickAnswerText(obj)
}

// Extracts the final answer text from a node, WITHOUT mixing it with reasoning.
// Order: choices/messages -> delta/message -> content; reasoning_content is
// deliberately not taken — that's the model's reasoning, not the answer.
function pickAnswerText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) {
    return node.map(pickAnswerText).join('')
  }
  if (typeof node !== 'object') return ''
  const obj = node as Record<string, unknown>

  for (const key of ['choices', 'messages']) {
    const v = obj[key]
    if (Array.isArray(v) && v.length) {
      const inner = v.map(pickAnswerText).join('')
      if (inner) return inner
    }
  }

  for (const key of ['content', 'text', 'answer', 'response']) {
    const v = obj[key]
    if (typeof v === 'string' && v) return v
  }

  for (const key of ['delta', 'message', 'data', 'payload', 'v']) {
    const v = obj[key]
    if (v && typeof v === 'object') {
      const inner = pickAnswerText(v)
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

// True when the SSE body shows a turn that ENDED (`quasi_status: FINISHED`)
// but produced NO answer text — the reasoning (THINK fragment) was generated
// and then the model stopped WITHOUT writing a RESPONSE fragment.
//
// This is the "Stopped + Continue button" case: DeepSeek finishes the turn
// with only reasoning, the UI shows a Continue button, and extractAnswer()
// returns '' (it only collects RESPONSE fragments). The old code then saw an
// empty capture, ignored it, and the finish loop waited out the whole timeout
// and threw ds.send_no_new_answer — to the operator the agent "hung on Stopped".
// Unlike generation_err, `quasi_status` here is FINISHED, so
// isGenerationIncompleteText() does NOT catch it.
//
export function isFinishedWithoutAnswer(body: string): boolean {
  const b = String(body || '')
  if (!b) return false
  const finished = FINISHED_STATUS_RE.test(b)
  if (!finished) return false
  // A RESPONSE fragment with actual content means the model DID answer.
  if (RESPONSE_CONTENT_RE.test(b)) return false
  // The turn carried reasoning (THINK) or was truncated mid-way; treat the
  // absence of response content as "no answer produced".
  return true
}

// The CONTEXT size (in tokens) DeepSeek reports for the current answer.
//
// chat.deepseek.com does not expose prompt_tokens/completion_tokens the way
// the API does. What it sends instead is `accumulated_token_usage` — a
// CUMULATIVE counter of the whole chat so far, present both in the SSE
// completion stream and (per message) in /api/v0/chat/history_messages. It
// is the number the operator wants for "how much context is used": the
// latest value is the current size of the chat context in tokens.
//
// SSE placement:
//   * the initial fragment: v.response.accumulated_token_usage
//   * an update chunk: {"p":"response","o":"BATCH",
//                       "v":[{"p":"accumulated_token_usage","v":N}, ...]}
// We take the LAST value seen (the freshest).
//
// Returns null when the body carries no counter (e.g. an OpenAI-shaped
// response or a non-answer endpoint) so the caller can keep the old value.
export function extractTokenUsage(body: string): number | null {
  let found: number | null = null
  const consider = (n: unknown): void => {
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) found = n
  }
  for (const obj of parseDataLines(body)) {
    if (obj == null || typeof obj !== 'object') continue
    const o = obj as Record<string, unknown>

    // The initial fragment: v.response.accumulated_token_usage.
    const v = o.v as Record<string, unknown> | undefined
    const resp =
      v && typeof v === 'object'
        ? (v.response as Record<string, unknown>)
        : undefined
    if (resp) consider(resp.accumulated_token_usage)

    // A BATCH update: v is an array of {"p":"accumulated_token_usage","v":N}.
    if (Array.isArray(o.v)) {
      for (const item of o.v) {
        if (item && typeof item === 'object') {
          const it = item as Record<string, unknown>
          if (it.p === 'accumulated_token_usage') consider(it.v)
        }
      }
    }
  }
  return found
}

// Saves the DeepSeek network response body to disk for post-mortem analysis.
// The files live in ~/.zames/net-log — from them the real answer format is visible.
// DEBUG ONLY: disabled unless ZAMES_NET_DEBUG=1. It writes a file per network
// response (thousands of files / tens of MB) and is not needed for the agent
// to work — the answer is taken from extractAnswer() in memory.
export async function dumpNetBody(url: string, body: string): Promise<void> {
  if (!process.env.ZAMES_NET_DEBUG) return
  try {
    const dir = path.join(os.homedir(), '.zames', 'net-log')
    await fs.mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safe = url.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80)
    await fs.writeFile(
      path.join(dir, stamp + '_' + safe + '.txt'),
      body,
      'utf-8',
    )
  } catch {}
}
