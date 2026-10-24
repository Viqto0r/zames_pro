import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { chromium } from 'playwright'
import {
  CONTEXT_LIMIT_RE,
  GENERATION_ERR_RE,
  GENERATION_TIMEOUT_RE,
  INCOMPLETE_STATUS_RE,
  RATE_LIMIT_RE,
  SERVER_BUSY_RE,
  STATUS_RE,
} from './deepseek-ui.js'

// Drop service placeholders ("Reading…", "Thinking…") so they are not mistaken
// for an answer; keep everything else as-is (including the whitespace the
// tool-call relies on). Pure: no `this`, no page.
export function cleanAnswer(raw: string): string {
  const t = (raw || '').trim()
  if (!t) return ''
  if (STATUS_RE.test(t)) return ''
  return raw
}

// Pure, state-free helpers extracted from browser.ts. Nothing
// here touches the DeepSeekBrowser instance state, so this module is safe to
// import anywhere (including hot-reloaded modules) without pulling in the
// live Playwright context. browser.ts re-exports the public names, so the
// existing API is unchanged.

// Muted terminal input for passwords. We do NOT use readline here: readline
// echoes the typed text through its own internal _writeToOutput, which cannot
// be reliably overridden from outside (a real bug: the login prompt swallowed
// the password step). Instead we read raw keystrokes from stdin and echo one
// `*` per typed character. In a non-TTY (pipe/redirect) we fall back to a
// plain line read.
export function askPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question)

    // Non-interactive: read a single line from stdin as-is.
    if (!process.stdin.isTTY) {
      void import('readline').then(({ createInterface }) => {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        })
        rl.question('', (answer: string) => {
          rl.close()
          resolve(answer)
        })
      })
      return
    }

    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    stdin.setRawMode(true)
    stdin.resume()

    let value = ''
    const onData = (buf: Buffer): void => {
      const s = buf.toString('utf8')
      for (const ch of s) {
        const code = ch.charCodeAt(0)
        // Enter / Ctrl+J -> done.
        if (ch === '\r' || ch === '\n') {
          done()
          return
        }
        // Ctrl+C -> abort the whole process (same as elsewhere in the CLI).
        if (code === 3) {
          cleanup()
          process.stdout.write('\n')
          process.exit(130)
        }
        // Ctrl+D -> finish with whatever we have.
        if (code === 4) {
          done()
          return
        }
        // Backspace (0x7f or 0x08): remove the last char and one star.
        // Delete a WHOLE code point: an emoji is two UTF-16 units, and
        // removing one left a LONE surrogate in the password — a broken code
        // point that never matches the real one.
        if (code === 127 || code === 8) {
          if (value.length > 0) {
            const prev = value.charCodeAt(value.length - 1)
            const low = prev >= 0xdc00 && prev <= 0xdfff
            const hi =
              value.length >= 2 ? value.charCodeAt(value.length - 2) : 0
            const pair = low && hi >= 0xd800 && hi <= 0xdbff
            value = value.slice(0, pair ? -2 : -1)
            process.stdout.write('\b \b')
          }
          continue
        }
        // Ignore other control characters (arrows, etc.).
        if (code < 32) continue
        value += ch
        process.stdout.write('*')
      }
    }

    const cleanup = (): void => {
      stdin.removeListener('data', onData)
      try {
        stdin.setRawMode(wasRaw || false)
      } catch {}
      stdin.pause()
    }

    const done = (): void => {
      cleanup()
      process.stdout.write('\n')
      resolve(value)
    }

    stdin.on('data', onData)
  })
}

export const USER_DATA_DIR = path.join(os.homedir(), '.zames', 'profile')
// Cache of the sanitized (non-Headless) User-Agent, keyed by the browser
// engine path. On the FIRST headless run we detect the real UA, strip the
// "Headless" marker and store it here; later runs pass it straight to
// _launchOnce, so the browser starts with a good UA and the "launch → read UA →
// relaunch" dance happens only once (it otherwise doubled every headless
// start). Keying by the executable path means a Playwright update (new engine
// path) invalidates the cache and we re-derive the UA once for the new build.
//
// The cache holds ONE entry PER ENGINE, not per provider: the UA depends on
// the browser build, not on the site. It used to be a single {engine,ua}
// record with providers appending a suffix (`engine:qwen`), so each provider
// overwrote the other's entry and a /provider switch relaunched the browser
// once per side. The file now maps engine key -> UA; a legacy single record is
// still read.
const HEADLESS_UA_CACHE = path.join(os.homedir(), '.zames', 'headless-ua.json')

type UaCacheFile = {
  engines?: Record<string, string>
  engine?: string
  ua?: string
}

// Pure: pick a reusable UA from the cache file's text for the given engine, or
// null. Exported so the policy is unit-tested without touching ~/.zames.
export function parseHeadlessUACache(
  raw: string,
  engine: string,
): string | null {
  try {
    const j = JSON.parse(raw) as UaCacheFile
    if (!j || typeof j !== 'object') return null
    const fromMap =
      j.engines && typeof j.engines === 'object' ? j.engines[engine] : ''
    const legacy = j.engine === engine ? j.ua : ''
    const ua = fromMap || legacy
    if (typeof ua === 'string' && ua && !/Headless/i.test(ua)) return ua
  } catch {}
  return null
}

// Pure: merge a UA into the cache file's text, keeping every OTHER engine's
// entry. Exported so the multi-engine contract is unit-tested.
export function mergeHeadlessUACache(
  raw: string,
  engine: string,
  ua: string,
): string {
  let engines: Record<string, string> = {}
  try {
    const j = JSON.parse(raw) as UaCacheFile
    if (j && j.engines && typeof j.engines === 'object') {
      engines = { ...j.engines }
    } else if (j && typeof j.engine === 'string' && typeof j.ua === 'string') {
      // Migrate a legacy single record into the map.
      engines[j.engine] = j.ua
    }
  } catch {}
  if (engine) engines[engine] = ua
  return JSON.stringify({ engines }, null, 2)
}

export function headlessEngineKey(): string {
  try {
    return chromium.executablePath()
  } catch {
    return ''
  }
}

export async function readCachedHeadlessUA(
  engine: string,
): Promise<string | null> {
  if (!engine) return null
  try {
    const raw = await fs.readFile(HEADLESS_UA_CACHE, 'utf-8')
    return parseHeadlessUACache(raw, engine)
  } catch {
    return null
  }
}

export async function writeCachedHeadlessUA(
  engine: string,
  ua: string,
): Promise<void> {
  if (!engine || !ua) return
  try {
    await fs.mkdir(path.dirname(HEADLESS_UA_CACHE), { recursive: true })
    let prev = ''
    try {
      prev = await fs.readFile(HEADLESS_UA_CACHE, 'utf-8')
    } catch {}
    await fs.writeFile(
      HEADLESS_UA_CACHE,
      mergeHeadlessUACache(prev, engine, ua),
      'utf-8',
    )
  } catch {}
}

// For /doctor: is a sanitized UA cached for the CURRENT engine build? A missing
// cache only means the next headless start relaunches once (not an error), so
// this is informational. Best-effort.
export async function headlessUACacheReady(): Promise<boolean> {
  const ua = await readCachedHeadlessUA(headlessEngineKey())
  return !!ua
}

// A headless Chrome advertises "HeadlessChrome/..." in its User-Agent, and
// DeepSeek's CDN (CloudFront/WAF) rejects that UA with a plain "403 ERROR"
// page before the app is even served — so a headless login looked broken while
// a headed one worked (headed Chrome sends "Chrome/..."). We keep the real
// engine version and only drop the "Headless" marker. When the operator
// explicitly set a UA in the config, that one wins (see _launchOnce).
export function sanitizeHeadlessUA(ua: string): string {
  return String(ua || '').replace(/HeadlessChrome/g, 'Chrome')
}
// Written after a successful sign-in so the next launch knows a session was
// stored in the persistent profile (used by /doctor and diagnostics).
//
// The marker is PER PROVIDER (`{ providers: { deepseek: {at}, qwen: {at} } }`).
// It used to be one shared file: Qwen wrote `{provider:'qwen'}` and DeepSeek a
// bare `{at}`, each overwriting the other, so /doctor and the startup banner
// reported "no session" for whichever provider had signed in second. A legacy
// record without `providers` still reads: `{provider:'qwen'}` means Qwen and a
// bare `{at}` means DeepSeek (the only writer before the second backend).
export const AUTH_MARKER_FILE = path.join(os.homedir(), '.zames', 'auth.json')

export type AuthMarkerProvider = 'deepseek' | 'qwen' | 'glm'

interface AuthMarkerFile {
  providers?: Record<string, { at?: string }>
  provider?: string
  at?: string
}

/**
 * PURE: does the marker text say `provider` has a stored session? Legacy
 * shapes are honored (see the comment above AUTH_MARKER_FILE).
 */
export function authMarkerHas(
  raw: string,
  provider: AuthMarkerProvider,
): boolean {
  if (!raw) return false
  let j: AuthMarkerFile
  try {
    j = JSON.parse(raw) as AuthMarkerFile
  } catch {
    return false
  }
  if (!j || typeof j !== 'object') return false
  if (j.providers && typeof j.providers === 'object') {
    return !!j.providers[provider]
  }
  if (typeof j.provider === 'string') return j.provider === provider
  // Legacy DeepSeek marker: a bare `{at}` with no provider field.
  return provider === 'deepseek' && typeof j.at === 'string'
}

/**
 * PURE: merge a "signed in at" timestamp for `provider` into the marker text,
 * KEEPING every other provider's entry. A legacy record is migrated.
 */
export function mergeAuthMarker(
  raw: string,
  provider: AuthMarkerProvider,
  at: string,
): string {
  const providers: Record<string, { at?: string }> = {}
  try {
    const j = JSON.parse(raw) as AuthMarkerFile
    if (j && j.providers && typeof j.providers === 'object') {
      for (const [k, v] of Object.entries(j.providers)) providers[k] = v || {}
    } else if (j && typeof j === 'object') {
      // A legacy record carries ONE provider name. Only Qwen and GLM ever wrote
      // one (`{provider:'qwen'|'glm', at}`); a BARE `{at}` was DeepSeek. Treating
      // every non-qwen name as DeepSeek filed a legacy GLM session under
      // `deepseek`, so /doctor reported a DeepSeek session and the GLM one
      // vanished.
      const p = typeof j.provider === 'string' ? j.provider : ''
      if (p === 'qwen' || p === 'glm') providers[p] = { at: j.at }
      else if (typeof j.at === 'string') providers.deepseek = { at: j.at }
    }
  } catch {}
  providers[provider] = { at }
  return JSON.stringify({ providers }, null, 2)
}

// Best-effort: read the marker text from disk ('' when absent/unreadable).
export async function readAuthMarker(): Promise<string> {
  try {
    return await fs.readFile(AUTH_MARKER_FILE, 'utf-8')
  } catch {
    return ''
  }
}

// Best-effort: mark `provider` as signed in, keeping the other providers'
// entries. Never throws (a marker is informational, not load-bearing).
export async function writeAuthMarker(
  provider: AuthMarkerProvider,
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(AUTH_MARKER_FILE), { recursive: true })
    const prev = await readAuthMarker()
    await fs.writeFile(
      AUTH_MARKER_FILE,
      mergeAuthMarker(prev, provider, new Date().toISOString()),
      'utf-8',
    )
  } catch {}
}

export function isGenerationIncompleteText(text: string): boolean {
  const t = String(text || '')
  return (
    GENERATION_ERR_RE.test(t) ||
    GENERATION_TIMEOUT_RE.test(t) ||
    INCOMPLETE_STATUS_RE.test(t)
  )
}

export function isRateLimitText(text: string): boolean {
  return RATE_LIMIT_RE.test(String(text || ''))
}

// The chat ran out of context: DeepSeek answers "Length limit reached. Please
// start a new chat." and will refuse every further send into this chat. Distinct
// from the rate limit (which clears with time) and from a server hiccup — the
// only recovery is compaction, so ask() must not retry in the same chat.
export function isContextLimitText(text: string): boolean {
  return CONTEXT_LIMIT_RE.test(String(text || ''))
}

export function isServerBusyText(text: string): boolean {
  const t = String(text || '')
  // Rate limit takes priority (it needs the long wait).
  if (RATE_LIMIT_RE.test(t)) return false
  return SERVER_BUSY_RE.test(t)
}

// Normalize text for comparison: collapse whitespace so that tiny DOM
// differences (nbsp, trailing spaces) don't count as "a new answer".
export function normText(s: string): string {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Distinct from the other failures so ask() waits a long time (DeepSeek limits
// reset over minutes) and then retries the send itself.
export class RateLimitError extends Error {
  constructor(detail: string) {
    super('Messages too frequent. Try again later. ' + detail)
    this.name = 'RateLimitError'
  }
}
// A transient DeepSeek overload: clears in seconds, so ask() retries it quickly
// instead of waiting out the rate-limit pause.
export class ServerBusyError extends Error {
  constructor(detail: string) {
    super('Server busy. Try again later. ' + detail)
    this.name = 'ServerBusyError'
  }
}

// The chat's context window is exhausted ("Length limit reached. Please start
// a new chat."). The server rejects EVERY send into this chat, so a retry in
// place is pointless: the caller must compact (open a NEW chat with a handover
// summary) and only then resend.
export class ContextLimitError extends Error {
  constructor(detail: string) {
    super('Chat context limit reached. ' + detail)
    this.name = 'ContextLimitError'
  }
}

// The generation was truncated by the server (`generation_err` / INCOMPLETE).
// Distinct from ServerBusyError: the DeepSeek backend answered, but the turn
// did not finish, and the UI offers a "Continue" button. The agent retries the
// same send (a new message into the chat) instead of waiting for an answer
// that will never arrive. This is what the operator hit with the reasoning
// (deep thinking) mode on: the long THINK phase makes the truncation far more
// likely, so with thinking off everything worked and with it on the turn kept
// stopping and showing "Continue".
export class GenerationIncompleteError extends Error {
  constructor(detail: string) {
    super('Generation incomplete (server truncated the answer). ' + detail)
    this.name = 'GenerationIncompleteError'
  }
}

export async function cleanSingletonFiles(dir: string = USER_DATA_DIR) {
  const names = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']
  for (const name of names) {
    const p = path.join(dir, name)
    try {
      await fs.unlink(p)
    } catch {}
  }
}

export async function profileLooksLocked(dir: string = USER_DATA_DIR) {
  try {
    await fs.access(path.join(dir, 'SingletonLock'))
    return true
  } catch {
    return false
  }
}

export async function nukeProfile(dir: string = USER_DATA_DIR) {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch {}
}
