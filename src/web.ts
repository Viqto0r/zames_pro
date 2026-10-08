import { chromium } from 'playwright'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { ToolArgs, ToolDef } from './types.js'

const DEFAULT_TIMEOUT = 20_000
const MAX_TEXT = 12_000

// Removes scripts, styles, and turns HTML into readable text. Exported for
// tests — the entity/whitespace/collapse branches are pure and worth pinning.
export function htmlToText(html: string): string {
  // Remove blocks we don't need
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Links: <a href="URL">text</a> → text (URL)
  s = s.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, text) => {
      const t = text.replace(/<[^>]+>/g, '').trim()
      return t ? `${t} (${href})` : href
    },
  )

  // Headings, paragraphs, BR → newlines
  s = s
    .replace(/<\/(h[1-6]|p|div|li|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')

  // HTML entities — the basic ones
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

  // Collapse blank lines
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')

  return s
}

// ---------- SSRF guard ----------
//
// WebFetch takes an arbitrary URL from the model. Without a guard it could be
// talked into reading cloud metadata (169.254.169.254), internal admin panels
// or localhost services. We resolve the hostname and refuse private / loopback
// / link-local addresses. Best-effort: a DNS rebind between the check and the
// fetch is out of scope for a CLI tool, but the common cases are covered.
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = v4.slice(1).map(Number)
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    return false
  }
  const low = ip.toLowerCase()
  if (low === '::1' || low === '::') return true
  if (low.startsWith('fe80') || low.startsWith('fc') || low.startsWith('fd')) {
    return true
  }
  const mapped = low.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isPrivateIp(mapped[1])
  return false
}

export function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === 'metadata.google.internal') return true
  return false
}

export async function assertPublicUrl(rawUrl: string): Promise<void> {
  const u = new URL(rawUrl)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`unsupported protocol: ${u.protocol}`)
  }
  const host = u.hostname
  if (isPrivateHostname(host)) {
    throw new Error(`blocked private host: ${host}`)
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error(`blocked private address: ${host}`)
    return
  }
  try {
    const addrs = await lookup(host, { all: true })
    for (const a of addrs) {
      if (isPrivateIp(a.address)) {
        throw new Error(`blocked private address for ${host}: ${a.address}`)
      }
    }
  } catch (e) {
    // Re-throw our own block, but let a DNS failure fall through so fetch()
    // surfaces the real network error instead of a misleading one.
    if ((e as Error).message.startsWith('blocked')) throw e
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms))

// True for content types whose bodies are not meant to be shown as text.
// WebFetch dumps the body into the context, so a PDF or an image would flood
// the model with garbage; the caller returns a short human note instead.
export function isBinaryContentType(contentType: string): boolean {
  const ct = String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim()
  if (!ct) return false
  if (ct.startsWith('text/')) return false
  // Textual application/* types must stay readable.
  if (
    /^(application\/(json|xml|xhtml\+xml|javascript|ecmascript|x-httpd-php|rtf|sql|graphql|x-sh|x-yaml|yaml|toml|ld\+json|x-ndjson))$/.test(
      ct,
    )
  ) {
    return false
  }
  if (/\+(json|xml)$/.test(ct)) return false
  if (
    /^(image|audio|video|font|model)\//.test(ct) ||
    /^application\/(pdf|zip|gzip|x-gzip|x-tar|octet-stream|msword|vnd\.|x-7z|x-rar|x-bzip|x-protobuf|wasm)/.test(
      ct,
    )
  ) {
    return true
  }
  return false
}

// fetch with retries for transient network errors and 5xx responses.
async function httpFetchWithRetry(
  url: string,
  opts: { timeout?: number; headers?: Record<string, string> } = {},
  retries = 2,
): Promise<{ status: number; url: string; contentType: string; body: string }> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await httpFetch(url, opts)
      if (r.status >= 500 && attempt < retries) {
        await sleep(300 * 2 ** attempt)
        continue
      }
      return r
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        await sleep(300 * 2 ** attempt)
        continue
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

// fetch with redirects, RE-VALIDATING every hop against the SSRF guard.
// redirect:'follow' would let a public URL bounce to 169.254.169.254 / 127.0.0.1
// after assertPublicUrl already approved the original — a classic SSRF bypass.
// So redirects are followed manually and each Location is checked first.
const MAX_REDIRECTS = 5

export async function httpFetch(
  url: string,
  {
    timeout = DEFAULT_TIMEOUT,
    headers = {},
  }: { timeout?: number; headers?: Record<string, string> } = {},
): Promise<{ status: number; url: string; contentType: string; body: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    let current = url
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current, {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ds-agent/1.0',
          'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
          ...headers,
        },
      })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (loc) {
          const next = new URL(loc, current).toString()
          // Validate the TARGET before requesting it.
          await assertPublicUrl(next)
          current = next
          continue
        }
      }
      const ct = res.headers.get('content-type') || ''
      const body = await res.text()
      return {
        status: res.status,
        url: res.url || current,
        contentType: ct,
        body,
      }
    }
    throw new Error(`too many redirects (>${MAX_REDIRECTS})`)
  } finally {
    clearTimeout(t)
  }
}

// A separate headless browser for JS pages.
// Lazy initialization so we don't waste resources.
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
    // Validate the pre-redirect URL (page.goto follows redirects internally,
    // unlike fetch we cannot intercept each hop here — but at least the
    // original is checked, matching the previous behavior).
    await assertPublicUrl(url)
    const resp = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
    })
    // Give JS a little time to finish rendering
    await page.waitForTimeout(1500)
    const html = await page.content()
    const status = resp ? resp.status() : 0
    const finalUrl = page.url()
    // The page may have redirected somewhere private; check the FINAL url too.
    try {
      await assertPublicUrl(finalUrl)
    } catch {
      throw new Error(`blocked private redirect target: ${finalUrl}`)
    }
    return { status, url: finalUrl, html }
  } finally {
    await ctx.close()
  }
}

// ---------- tools ----------

export function createWebTools(): ToolDef[] {
  return [
    {
      name: 'WebFetch',
      description:
        'Fetch a URL and return the cleaned text of the page (without HTML tags). ' +
        'Use it to read docs, articles, READMEs on GitHub. ' +
        'If the page is rendered by JavaScript and the text is empty — retry with render=true.',
      parameters: {
        url: 'string',
        render: 'boolean?',
        maxChars: 'number?',
      },
      fn: async ({ url, render, maxChars }: ToolArgs) => {
        if (!/^https?:\/\//i.test(String(url))) {
          return `Error: URL must start with http:// or https://`
        }

        const limit = Math.min(Number(maxChars) || MAX_TEXT, 60_000)

        try {
          await assertPublicUrl(String(url))

          if (render) {
            const r = await renderWithHeadless(String(url))
            const text = htmlToText(r.html)
            return formatResult(r.status, r.url, text, limit)
          }

          const r = await httpFetchWithRetry(String(url))

          // Binary content (PDF, images, archives, ...) must NOT be dumped
          // into the context as raw bytes — tell the model what it is instead.
          if (isBinaryContentType(r.contentType)) {
            return (
              `HTTP ${r.status}  ${r.url}\n` +
              `Content-Type: ${r.contentType}\n\n` +
              `(binary content is not returned as text; content-type: ${r.contentType})`
            )
          }

          // If it's JSON/plain text — return as is
          if (
            /application\/json|text\/plain|text\/markdown/i.test(r.contentType)
          ) {
            const trimmed = r.body.slice(0, limit)
            return `HTTP ${r.status}  ${r.url}\nContent-Type: ${r.contentType}\n\n${trimmed}`
          }

          // HTML — clean it up
          const text = htmlToText(r.body)

          // If there's almost no text — probably a JS page, give a hint
          if (text.length < 200) {
            return (
              `HTTP ${r.status}  ${r.url}\n` +
              `Content-Type: ${r.contentType}\n\n` +
              `The page is almost empty in raw HTML (${text.length} chars). ` +
              `It looks like the content is rendered by JavaScript. ` +
              `Retry with render=true.\n\n---\n${text}`
            )
          }

          return formatResult(r.status, r.url, text, limit)
        } catch (e) {
          return `Error fetching ${url}: ${(e as Error).message}`
        }
      },
    },

    {
      name: 'WebSearch',
      description:
        'Search the web via DuckDuckGo HTML (no API key). ' +
        'Returns a list of results: title, URL, short description.',
      parameters: {
        query: 'string',
        maxResults: 'number?',
      },
      fn: async ({ query, maxResults }: ToolArgs) => {
        const q = encodeURIComponent(String(query || ''))
        if (!q) return 'Error: query is empty.'

        const limit = Math.min(Math.max(Number(maxResults) || 8, 1), 20)

        try {
          const r = await httpFetchWithRetry(
            `https://html.duckduckgo.com/html/?q=${q}`,
            {
              timeout: 25_000,
              headers: {
                Accept: 'text/html,application/xhtml+xml',
              },
            },
          )

          if (r.status !== 200) {
            return `DuckDuckGo returned HTTP ${r.status}`
          }

          const results = parseDuckDuckGoResults(r.body, limit)

          if (!results.length) {
            return `No results found. The DuckDuckGo output format may have changed.`
          }

          const lines = results.map(
            (r, i) =>
              `${i + 1}. ${r.title}\n   ${r.url}` +
              (r.snippet ? `\n   ${r.snippet}` : ''),
          )
          return lines.join('\n\n')
        } catch (e) {
          return `Search error: ${(e as Error).message}`
        }
      },
    },
  ]
}

// Parse the DuckDuckGo HTML results page. Pure; exported for tests. The
// html.duckduckgo.com format is stable, so simple regexes suffice. DuckDuckGo
// wraps links in a /l/?uddg=... redirect which must be unwrapped.
export function parseDuckDuckGoResults(
  body: string,
  limit: number,
): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = []
  const re =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) && results.length < limit) {
    let href = m[1]
    const uddgMatch = href.match(/[?&]uddg=([^&]+)/)
    if (uddgMatch) href = decodeURIComponent(uddgMatch[1])
    const title = htmlToText(m[2] || '').trim()
    const snippet = htmlToText(m[3] || '').trim()
    if (!title || !href) continue
    results.push({ title, url: href, snippet })
  }
  return results
}

function formatResult(
  status: number,
  url: string,
  text: string,
  limit: number,
): string {
  let out = text
  let truncated = false
  if (out.length > limit) {
    out = out.slice(0, limit)
    truncated = true
  }
  return (
    `HTTP ${status}  ${url}\n\n${out}` +
    (truncated ? `\n\n[...truncated at ${limit} chars]` : '')
  )
}
