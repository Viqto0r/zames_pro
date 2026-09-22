import fs from 'fs/promises'
import os from 'os'
import path from 'path'

// Извлечение СЫРОГО текста ответа модели из сетевых данных DeepSeek.
//
// Зачем: чтение ответа идёт из ОТРЕНДЕРЕННОГО DOM, а рендер DeepSeek
// искажает ответ — превращает доллар-формулы в LaTeX (символ доллара
// теряется), нормализует переводы строк, делает автолинки. Из-за этого
// tool-call с шаблонными строками и экранированными переводами строк в
// аргументах доходил до инструментов искажённым. Здесь мы достаём исходный
// текст из тела сетевого ответа.
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

// Собирает текст ответа из SSE-потока. Поддерживает два формата:
//   * OpenAI-совместимый: choices[].delta.content (reasoning_content
//     игнорируется — это размышления, а не ответ);
//   * DeepSeek chat.deepseek.com: стартовый v.response.fragments[] и
//     инкрементальные APPEND-чанки response/fragments/-1/content.
export function extractFromSse(body: string): string {
  let out = ''
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
      for (const fr of resp.fragments as Record<string, unknown>[]) {
        if (fr && fr.type === 'RESPONSE' && typeof fr.content === 'string') {
          out += fr.content
        }
      }
      continue
    }

    // Инкрементальный APPEND: p='response/fragments/-1/content' -> v=строка;
    // последующие чанки идут с одним полем v.
    if (o.p === 'response/fragments/-1/content' && typeof o.v === 'string') {
      out += o.v
      continue
    }
    if (o.p === undefined && typeof o.v === 'string') {
      out += o.v
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

// Достает финальный текст ответа из узла, НЕ смешивая его с reasoning.
// Порядок: choices/messages -> delta/message -> content; reasoning_content
// намеренно не берем — это размышления модели, а не ответ.
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

// Универсальная попытка: сначала SSE, затем обычный JSON.
export function extractAnswer(body: string): string {
  const sse = extractFromSse(body)
  if (sse) return sse
  return extractFromJson(body)
}

// Сохраняет тело сетевого ответа DeepSeek на диск для разбора постфактум.
// Файлы лежат в ~/.zames/net-log — po nim видно реальный формат ответа.
export async function dumpNetBody(url: string, body: string): Promise<void> {
  try {
    const dir = path.join(os.homedir(), '.zames', 'net-log')
    await fs.mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safe = url.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80)
    await fs.writeFile(path.join(dir, stamp + '_' + safe + '.txt'), body, 'utf-8')
  } catch {}
}
