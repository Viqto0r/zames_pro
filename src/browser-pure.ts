import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { chromium } from 'playwright'
import {
  GENERATION_ERR_RE,
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

// Pure, state-free helpers extracted from browser.ts (BACKLOG C3). Nothing
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
        if (code === 127 || code === 8) {
          if (value.length > 0) {
            value = value.slice(0, -1)
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
const HEADLESS_UA_CACHE = path.join(os.homedir(), '.zames', 'headless-ua.json')

// Pure: pick a reusable UA from the cache file's text for the given engine, or
// null. Exported so the policy is unit-tested without touching ~/.zames.
export function parseHeadlessUACache(
  raw: string,
  engine: string,
): string | null {
  try {
    const j = JSON.parse(raw)
    if (
      j &&
      j.engine === engine &&
      typeof j.ua === 'string' &&
      j.ua &&
      !/Headless/i.test(j.ua)
    ) {
      return j.ua
    }
  } catch {}
  return null
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
    await fs.writeFile(
      HEADLESS_UA_CACHE,
      JSON.stringify({ engine, ua }, null, 2),
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
export const AUTH_MARKER_FILE = path.join(os.homedir(), '.zames', 'auth.json')

export function isGenerationIncompleteText(text: string): boolean {
  const t = String(text || '')
  return GENERATION_ERR_RE.test(t) || INCOMPLETE_STATUS_RE.test(t)
}

export function isRateLimitText(text: string): boolean {
  return RATE_LIMIT_RE.test(String(text || ''))
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

// The "too frequent" error: distinct from others so ask() waits a long time
// (DeepSeek limits reset over minutes) and retries the send itself.
export class RateLimitError extends Error {
  constructor(detail: string) {
    super('Messages too frequent. Try again later. ' + detail)
    this.name = 'RateLimitError'
  }
}
// DeepSeek transient server error (Server busy).
export class ServerBusyError extends Error {
  constructor(detail: string) {
    super('Server busy. Try again later. ' + detail)
    this.name = 'ServerBusyError'
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

// ---------- profile cleanup ----------

export async function cleanSingletonFiles() {
  const names = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']
  for (const name of names) {
    const p = path.join(USER_DATA_DIR, name)
    try {
      await fs.unlink(p)
    } catch {}
  }
}

export async function profileLooksLocked() {
  try {
    await fs.access(path.join(USER_DATA_DIR, 'SingletonLock'))
    return true
  } catch {
    return false
  }
}

export async function nukeProfile() {
  try {
    await fs.rm(USER_DATA_DIR, { recursive: true, force: true })
  } catch {}
}
