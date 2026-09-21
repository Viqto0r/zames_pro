import { chromium } from 'playwright'
import type { ToolArgs, ToolDef } from './types.js'

const DEFAULT_TIMEOUT = 20_000
const MAX_TEXT = 12_000

// Убирает скрипты, стили, и превращает HTML в читабельный текст.
function htmlToText(html: string): string {
  // Удаляем блоки, которые не нужны
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Ссылки: <a href="URL">text</a> → text (URL)
  s = s.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, text) => {
      const t = text.replace(/<[^>]+>/g, '').trim()
      return t ? `${t} (${href})` : href
    },
  )

  // Заголовки, параграфы, BR → переводы строк
  s = s
    .replace(/<\/(h[1-6]|p|div|li|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')

  // HTML entities — базовые
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )

  // Сжимаем пустые строки
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')

  return s
}

// fetch с редиректами и таймаутом
async function httpFetch(
  url: string,
  { timeout = DEFAULT_TIMEOUT, headers = {} }: { timeout?: number; headers?: Record<string, string> } = {},
): Promise<{ status: number; url: string; contentType: string; body: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ds-agent/1.0',
        'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
        ...headers,
      },
    })
    const ct = res.headers.get('content-type') || ''
    const body = await res.text()
    return { status: res.status, url: res.url, contentType: ct, body }
  } finally {
    clearTimeout(t)
  }
}

// Отдельный headless-браузер для JS-страниц.
// Ленивая инициализация, чтобы не тратить ресурсы впустую.
let _headless: Awaited<ReturnType<typeof chromium.launch>> | null = null
async function getHeadless() {
  if (_headless) return _headless
  _headless = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  })
  return _headless
}

export async function closeWeb() {
  if (_headless) {
    try {
      await _headless.close()
    } catch {}
    _headless = null
  }
}

async function renderWithHeadless(
  url: string,
  { timeout = DEFAULT_TIMEOUT }: { timeout?: number } = {},
) {
  const browser = await getHeadless()
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()
  try {
    const resp = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
    })
    // Дать JS немного времени дорисовать
    await page.waitForTimeout(1500)
    const html = await page.content()
    const status = resp ? resp.status() : 0
    const finalUrl = page.url()
    return { status, url: finalUrl, html }
  } finally {
    await ctx.close()
  }
}

// ---------- инструменты ----------

export function createWebTools(): ToolDef[] {
  return [
    {
      name: 'WebFetch',
      description:
        'Загрузить URL и вернуть очищенный текст страницы (без HTML-тегов). ' +
        'Используй для чтения документации, статей, README на GitHub. ' +
        'Если страница рендерится JavaScript-ом и текст пустой — попробуй ещё раз с render=true.',
      parameters: {
        url: 'string',
        render: 'boolean?',
        maxChars: 'number?',
      },
      fn: async ({ url, render, maxChars }: ToolArgs) => {
        if (!/^https?:\/\//i.test(String(url))) {
          return `Ошибка: URL должен начинаться с http:// или https://`
        }

        const limit = Math.min(Number(maxChars) || MAX_TEXT, 60_000)

        try {
          if (render) {
            const r = await renderWithHeadless(String(url))
            const text = htmlToText(r.html)
            return formatResult(r.status, r.url, text, limit)
          }

          const r = await httpFetch(String(url))

          // Если это JSON/plain text — вернуть как есть
          if (
            /application\/json|text\/plain|text\/markdown/i.test(r.contentType)
          ) {
            const trimmed = r.body.slice(0, limit)
            return `HTTP ${r.status}  ${r.url}\nContent-Type: ${r.contentType}\n\n${trimmed}`
          }

          // HTML — почистить
          const text = htmlToText(r.body)

          // Если текста почти нет — вероятно JS-страница, дать намёк
          if (text.length < 200) {
            return (
              `HTTP ${r.status}  ${r.url}\n` +
              `Content-Type: ${r.contentType}\n\n` +
              `Страница почти пустая в сыром HTML (${text.length} символов). ` +
              `Похоже, контент рендерится JavaScript-ом. ` +
              `Повтори вызов с render=true.\n\n---\n${text}`
            )
          }

          return formatResult(r.status, r.url, text, limit)
        } catch (e) {
          return `Ошибка загрузки ${url}: ${(e as Error).message}`
        }
      },
    },

    {
      name: 'WebSearch',
      description:
        'Поиск в интернете через DuckDuckGo HTML (без API-ключа). ' +
        'Возвращает список результатов: заголовок, URL, краткое описание.',
      parameters: {
        query: 'string',
        maxResults: 'number?',
      },
      fn: async ({ query, maxResults }: ToolArgs) => {
        const q = encodeURIComponent(String(query || ''))
        if (!q) return 'Ошибка: query пустой.'

        const limit = Math.min(Math.max(Number(maxResults) || 8, 1), 20)

        try {
          const r = await httpFetch(
            `https://html.duckduckgo.com/html/?q=${q}`,
            {
              timeout: 25_000,
              headers: {
                Accept: 'text/html,application/xhtml+xml',
              },
            },
          )

          if (r.status !== 200) {
            return `DuckDuckGo вернул HTTP ${r.status}`
          }

          // Парсим простыми регексами. Формат html.duckduckgo.com стабильный.
          const results = []
          const re =
            /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>)?/gi

          let m
          while ((m = re.exec(r.body)) && results.length < limit) {
            let href = m[1]
            // DuckDuckGo заворачивает ссылки в редирект вида /l/?uddg=...
            const uddgMatch = href.match(/[?&]uddg=([^&]+)/)
            if (uddgMatch) href = decodeURIComponent(uddgMatch[1])

            const title = htmlToText(m[2] || '').trim()
            const snippet = htmlToText(m[3] || '').trim()

            if (!title || !href) continue
            results.push({ title, url: href, snippet })
          }

          if (!results.length) {
            return `Результатов не найдено. Возможно, изменился формат выдачи DuckDuckGo.`
          }

          const lines = results.map(
            (r, i) =>
              `${i + 1}. ${r.title}\n   ${r.url}` +
              (r.snippet ? `\n   ${r.snippet}` : ''),
          )
          return lines.join('\n\n')
        } catch (e) {
          return `Ошибка поиска: ${(e as Error).message}`
        }
      },
    },
  ]
}

function formatResult(status: number, url: string, text: string, limit: number): string {
  let out = text
  let truncated = false
  if (out.length > limit) {
    out = out.slice(0, limit)
    truncated = true
  }
  return (
    `HTTP ${status}  ${url}\n\n${out}` +
    (truncated ? `\n\n[...обрезано на ${limit} символах]` : '')
  )
}
