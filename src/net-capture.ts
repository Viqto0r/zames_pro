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

export function extractFromSse(body: string): string {
  const chunks: string[] = []
  const lines = body.split(String.fromCharCode(10))
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    let obj: unknown
    try {
      obj = JSON.parse(payload)
    } catch {
      continue
    }
    const t = pickAnswerText(obj)
    if (t) chunks.push(t)
  }
  return chunks.join('')
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

// Достаёт финальный текст ответа из узла, НЕ смешивая его с reasoning.
// Порядок: choices/messages -> delta/message -> content; reasoning_content
// намеренно не берём — это размышления модели, а не ответ.
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
// Файлы лежат в ~/.zames/net-log — по ним видно реальный формат ответа.
export async function dumpNetBody(url: string, body: string): Promise<void> {
  try {
    const dir = path.join(os.homedir(), '.zames', 'net-log')
    await fs.mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safe = url.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80)
    await fs.writeFile(path.join(dir, stamp + '_' + safe + '.txt'), body, 'utf-8')
  } catch {}
}
