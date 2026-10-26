import { chromium } from 'playwright'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { ToolArgs, ToolDef } from './types.js'

const DEFAULT_TIMEOUT = 20_000
const MAX_TEXT = 12_000

// Removes scripts, styles, and turns HTML into readable text. Exported for
// tests — the entity/whitespace/collapse branches are pure and worth pinning.
// Decode ONE numeric HTML entity to its character. A hostile/broken page can
// carry `&#999999999;` (beyond Unicode), a surrogate (`&#xD800;`) or a huge
// hex value; String.fromCodePoint THROWS RangeError on those, and the throw
// escaped htmlToText into the WebFetch handler — the whole page came back as
// "Error fetching <url>: Invalid code point 999999999". An undecodable
// reference is kept VERBATIM instead.
//
// A surrogate PAIR written as two references (`&#55357;&#56832;`) is ONE
// astral character (an emoji): decoding each half alone left two lone
// surrogates in the text. A lone high surrogate is remembered and JOINED with
// the low surrogate that immediately follows it (the replacer runs in order).
let pendingHighSurrogate: string | null = null
function decodeEntityCode(cp: number): string {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) return ''
  if (cp >= 0xd800 && cp <= 0xdbff) {
    pendingHighSurrogate = String.fromCharCode(cp)
    return ''
  }
  if (cp >= 0xdc00 && cp <= 0xdfff) {
    const high = pendingHighSurrogate
    pendingHighSurrogate = null
    return high ? high + String.fromCharCode(cp) : String.fromCharCode(cp)
  }
  pendingHighSurrogate = null
  return String.fromCodePoint(cp)
}

export function htmlToText(html: string): string {
  // Reset the cross-reference surrogate state: it must never leak from one
  // document to the next.
  pendingHighSurrogate = null
  // Remove blocks we don't need
  let s = html
    // A tag that never CLOSES (a truncated body, or HTML the regex cannot
    // pair) used to leak its raw JS/CSS into the text: also drop everything
    // from an unclosed opening tag to the end of the document.
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[\s\S]*$/i, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<style\b[\s\S]*$/i, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<noscript\b[\s\S]*$/i, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<svg\b[\s\S]*$/i, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Links: <a href="URL">text</a> → text (URL)
  s = s.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, text) => {
      const t = text.replace(/<[^>]+>/g, '').trim()
      return t ? `${t} (${href})` : href
    },
  )

  // Headings, paragraphs, BR → newlines. A table CELL ends with a space: the
  // cells are joined without any separator otherwise, so `<td>Name</td>`
  // `<td>42</td>` became `Name42` — two independent values fused into one, and
  // the model reported a number that never appeared on the page.
  s = s
    .replace(/<\/(h[1-6]|p|div|li|tr|section|article)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' ')
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
    .replace(/&#(\d+);/g, (_, n) => decodeEntityCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => decodeEntityCode(parseInt(n, 16)))

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
// Parse an inet_aton-style IPv4 literal (the form WHATWG URL and the OS also
// accept) into a uint32, or null when it is not one. Rules: 1-4 parts; each
// part may be hex (0x…), octal (leading 0) or decimal; the LAST part fills all
// remaining bytes, so `127.1` == 127.0.0.1 and `2130706433` == 127.0.0.1.
function parseLegacyIpv4(host: string): number | null {
  const h = String(host || '').trim()
  if (!h) return null
  const parts = h.split('.')
  if (parts.length < 1 || parts.length > 4) return null
  const nums: number[] = []
  for (const p of parts) {
    if (p === '') return null
    let v: number
    if (/^0[xX][0-9a-fA-F]+$/.test(p)) v = parseInt(p.slice(2), 16)
    else if (/^0[0-7]+$/.test(p)) v = parseInt(p.slice(1), 8)
    else if (/^\d+$/.test(p)) v = parseInt(p, 10)
    else return null
    if (!Number.isFinite(v) || v < 0) return null
    nums.push(v)
  }
  // Every part except the last must fit one byte; the last fills the rest.
  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i] > 0xff) return null
  }
  const lastMax = Math.pow(256, 5 - nums.length) - 1
  if (nums[nums.length - 1] > lastMax) return null
  let n = 0
  for (let i = 0; i < nums.length - 1; i++) {
    n += nums[i] * Math.pow(256, 3 - i)
  }
  n += nums[nums.length - 1]
  return n >>> 0
}

// Collapse an IPv6 literal to the canonical `a:b:c:d:e:f:g:h` hex form so the
// prefix checks below see the SAME address whether it was written short
// (`::1`, `::ffff:7f00:1`) or fully expanded (`0:0:0:0:0:0:0:1`,
// `0:0:0:0:0:ffff:7f00:1`). A text-prefix match treated the expanded form as
// PUBLIC, which let the SSRF guard reach loopback. Returns null for a non-IPv6
// string or a malformed literal.
function expandIpv6(ip: string): number[] | null {
  const s = ip.toLowerCase()
  if (!s.includes(':')) return null
  // An embedded dotted IPv4 tail (::ffff:127.0.0.1) is folded into two hex
  // groups first, so the split below has a uniform shape.
  const dotted = s.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  let body = s
  if (dotted) {
    const [a, b, c, d] = dotted.slice(2).map(Number)
    if ([a, b, c, d].some((n) => n > 255)) return null
    const hi = ((a << 8) | b).toString(16)
    const lo = ((c << 8) | d).toString(16)
    body = dotted[1] + hi + ':' + lo
  }
  const halves = body.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const groups: string[] = []
  for (const g of [...head, ...tail]) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    groups.push(g)
  }
  const missing = 8 - groups.length - (halves.length === 2 ? 0 : 0)
  if (halves.length === 2) {
    if (missing < 0) return null
    return [...head, ...Array(missing).fill('0'), ...tail].map((g) =>
      parseInt(g, 16),
    )
  }
  if (groups.length !== 8) return null
  return groups.map((g) => parseInt(g, 16))
}

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
  // A NON-canonical IPv4 literal is still a number: WHATWG URL and inet_aton
  // accept 1-4 parts with decimal/octal/hex digits (`2130706433`,
  // `0x7f.1`, `0177.0.0.1`, `127.1` all mean 127.0.0.1). Recognising only the
  // dotted-quad form let those through the SSRF guard (a classic bypass).
  if (/^[0-9a-fx.]+$/i.test(ip) && !ip.includes(':')) {
    const n = parseLegacyIpv4(ip)
    if (n !== null) {
      return isPrivateIp(
        ((n >>> 24) & 0xff) +
          '.' +
          ((n >>> 16) & 0xff) +
          '.' +
          ((n >>> 8) & 0xff) +
          '.' +
          (n & 0xff),
      )
    }
  }
  const low = ip.toLowerCase()
  // Judge the EXPANDED form so `0:0:0:0:0:0:0:1` is treated exactly like
  // `::1` (a text-prefix match called the expanded literal public).
  const v6 = expandIpv6(ip)
  if (v6) {
    const allZero = v6.every((g) => g === 0)
    const loopback = v6.slice(0, 7).every((g) => g === 0) && v6[7] === 1
    if (allZero || loopback) return true
    const g0 = v6[0]
    // fe80::/10 link-local, fec0::/10 deprecated site-local.
    if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true
    // fc00::/7 unique-local.
    if ((g0 & 0xfe00) === 0xfc00) return true
    // ff00::/8 multicast is not a public unicast destination either.
    if ((g0 & 0xff00) === 0xff00) return true
    // 6to4 (2002:AABB:CCDD::/48) embeds an IPv4 in groups 1-2, so
    // `2002:7f00:0001::` IS 127.0.0.1 and `2002:a9fe:a9fe::` is the cloud
    // metadata address. Judged by the embedded address, like the other
    // transition prefixes.
    if (v6[0] === 0x2002) {
      return isPrivateIp(
        (v6[1] >> 8) +
          '.' +
          (v6[1] & 0xff) +
          '.' +
          (v6[2] >> 8) +
          '.' +
          (v6[2] & 0xff),
      )
    }
    // Teredo (2001:0000::/32): the CLIENT IPv4 is the last 32 bits XORed with
    // 0xffffffff (the server IPv4 sits in groups 3-4 and is not the peer).
    if (v6[0] === 0x2001 && v6[1] === 0x0000) {
      const a = (v6[6] >> 8) ^ 0xff
      const b = (v6[6] & 0xff) ^ 0xff
      const c = (v6[7] >> 8) ^ 0xff
      const d = (v6[7] & 0xff) ^ 0xff
      return isPrivateIp(a + '.' + b + '.' + c + '.' + d)
    }
    // IPv4-mapped ::ffff:a.b.c.d — judge the embedded address.
    const mappedV4 = v6.slice(0, 5).every((g) => g === 0) && v6[5] === 0xffff
    if (mappedV4) {
      return isPrivateIp(
        (v6[6] >> 8) +
          '.' +
          (v6[6] & 0xff) +
          '.' +
          (v6[7] >> 8) +
          '.' +
          (v6[7] & 0xff),
      )
    }
  }
  if (low === '::1' || low === '::') return true
  // IPv6 link-local is fe80::/10, i.e. fe80..febf (the old `startsWith('fe80')`
  // missed fe90::, fea0:: and febf::). ULA is fc00::/7 (fc..fd). fec0::/10
  // (deprecated site-local) is also treated as non-public.
  if (
    /^fe[89abcde]/.test(low) ||
    low.startsWith('fc') ||
    low.startsWith('fd')
  ) {
    return true
  }
  // IPv4-mapped in DOTTED form (::ffff:127.0.0.1).
  const mapped = low.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isPrivateIp(mapped[1])
  // IPv4-mapped in HEX form (::ffff:7f00:1 == 127.0.0.1) and the NAT64
  // well-known prefix 64:ff9b::/96 (which can encode 127.0.0.1 too).
  const mappedHex = low.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    return isPrivateIp(
      ((hi >> 8) & 0xff) +
        '.' +
        (hi & 0xff) +
        '.' +
        ((lo >> 8) & 0xff) +
        '.' +
        (lo & 0xff),
    )
  }
  if (low.startsWith('64:ff9b:')) return true
  // IPv4-COMPATIBLE form `::a.b.c.d` (deprecated, but the OS/HTTP stack still
  // resolves it, so `http://[::127.0.0.1]/` reached localhost). `::` itself and
  // `::1` are already handled above; `::ffff:…` was handled as MAPPED. Any
  // other `::`-prefixed address whose tail is an embedded IPv4 belongs to the
  // same family and must be judged by the embedded address.
  const compat = low.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (compat) return isPrivateIp(compat[1])
  const compatHex = low.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (compatHex) {
    const hi = parseInt(compatHex[1], 16)
    const lo = parseInt(compatHex[2], 16)
    return isPrivateIp(
      ((hi >> 8) & 0xff) +
        '.' +
        (hi & 0xff) +
        '.' +
        ((lo >> 8) & 0xff) +
        '.' +
        (lo & 0xff),
    )
  }
  return false
}

export function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  // Cloud metadata / cluster service ALIASES. `metadata` (GCP), `instance-data`
  // (AWS) and `kubernetes.default[.svc]` are internal-only names; blocking them
  // by name does not depend on a split-horizon DNS answering with a private IP.
  if (h === 'metadata.google.internal') return true
  if (h === 'metadata' || h === 'instance-data') return true
  if (h === 'kubernetes.default' || h === 'kubernetes.default.svc') return true
  // Internal/mDNS/service names that never belong to the public internet.
  if (h.endsWith('.internal') || h === 'internal') return true
  if (h.endsWith('.local') || h === 'local') return true
  if (h.endsWith('.home.arpa')) return true
  return false
}

export async function assertPublicUrl(rawUrl: string): Promise<void> {
  const u = new URL(rawUrl)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`unsupported protocol: ${u.protocol}`)
  }
  // The URL API keeps the BRACKETS of an IPv6 literal (`[::ffff:7f00:1]`),
  // and net.isIP() rejects a bracketed host — so the address fell through to
  // the DNS lookup branch and the literal was never checked as an address.
  const host = u.hostname.replace(/^\[(.*)\]$/, '$1')
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
          // Drain/close the redirect body: otherwise each hop leaks a socket
          // (up to MAX_REDIRECTS per fetch), which exhausts the pool on a long
          // series of fetches.
          await res.body?.cancel().catch(() => {})
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

// ONE reused context for every render-fetch. Creating a fresh context per call
// (as before) re-allocated the user-agent/network stack each time, which is
// heavy for a series of render=true fetches. Pages are closed after each fetch,
// the context itself is reused and closed in closeWeb().
//
// The cache is a tiny pure factory so the reuse/reset behaviour can be unit-
// tested without launching a real browser.
export function createReusable<T>(
  factory: () => Promise<T>,
  dispose: (value: T) => Promise<void>,
): { get: () => Promise<T>; reset: () => Promise<void> } {
  let cached: T | null = null
  return {
    async get() {
      if (cached === null) cached = await factory()
      return cached
    },
    async reset() {
      if (cached === null) return
      const v = cached
      cached = null
      await dispose(v).catch(() => {})
    },
  }
}

type HeadlessContext = Awaited<
  ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newContext']>
>

const _headlessCtxCache = createReusable<HeadlessContext>(
  async () => {
    const browser = await getHeadless()
    return browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
  },
  (ctx) => ctx.close(),
)

export async function closeWeb() {
  await _headlessCtxCache.reset()
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
  const ctx = await _headlessCtxCache.get()
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
    // Close the PAGE, not the shared context.
    await page.close().catch(() => {})
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

        const limit = Math.max(
          1,
          Math.min(Number(maxChars) || MAX_TEXT, 60_000),
        )

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
  // Parse the page ROW BY ROW: each `result__a` title opens a result, and a
  // `result__snippet` belongs to the result opened most recently. The old
  // single regex made the snippet group OPTIONAL with an unbounded gap, so a
  // result without a snippet picked up the FOLLOWING result's snippet (wrong
  // text under a URL). A row scan ties every snippet to its own result.
  // A result anchor is `<a … class="… result__a|result__snippet …" …>`. The
  // attribute VALUES may be single-quoted (HTML allows both, and a page served
  // through a proxy does), so each quote style is accepted rather than only
  // `class="…"`. Rejecting them made a valid page parse to zero results and
  // WebSearch answer "the output format may have changed".
  const anchorRe = /<a[^>]*class=(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi
  const hrefOf = (tag: string): string => {
    const m = tag.match(/href=(?:"([^"]*)"|'([^']*)')/i)
    return m ? (m[1] ?? m[2] ?? '') : ''
  }
  let cur: { title: string; url: string; snippet: string } | null = null
  // The page can repeat the SAME result (a sponsored row mirroring an organic
  // one): two identical URLs made WebSearch print and cite it twice.
  const seenUrls = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(body))) {
    const classes = m[1] ?? m[2] ?? ''
    const kindMatch = /result__(a|snippet)/i.exec(classes)
    if (!kindMatch) continue
    const kind = kindMatch[1].toLowerCase()
    const text = m[3] || ''
    if (kind === 'a') {
      if (cur && cur.title && /^https?:\/\//i.test(cur.url)) {
        if (!seenUrls.has(cur.url)) {
          seenUrls.add(cur.url)
          results.push(cur)
          if (results.length >= limit) return results
        }
      }
      cur = { title: htmlToText(text).trim(), url: '', snippet: '' }
      // The href lives in the OPENING tag, which m[0] starts with.
      let href = hrefOf(m[0].slice(0, m[0].indexOf('>') + 1))
      const uddg = href.match(/[?&]uddg=([^&]+)/)
      if (uddg) {
        try {
          href = decodeURIComponent(uddg[1])
        } catch {
          href = uddg[1]
        }
      }
      cur.url = href
      continue
    }
    if (cur && !cur.snippet) cur.snippet = htmlToText(text).trim()
  }
  if (
    cur &&
    cur.title &&
    /^https?:\/\//i.test(cur.url) &&
    !seenUrls.has(cur.url)
  ) {
    seenUrls.add(cur.url)
    results.push(cur)
  }
  return results.slice(0, limit)
}

/**
 * Clip fetched page text WITHOUT splitting a surrogate pair. PURE;
 * exported so the clip is unit-tested (formatResult itself is private).
 */
export function capFetchedText(text: string, limit: number): string {
  if (text.length <= limit) return text
  let cut = Math.max(0, limit)
  const last = text.charCodeAt(cut - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut--
  return text.slice(0, cut)
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
    out = capFetchedText(out, limit)
    truncated = true
  }
  return (
    `HTTP ${status}  ${url}\n\n${out}` +
    (truncated ? `\n\n[...truncated at ${limit} chars]` : '')
  )
}
