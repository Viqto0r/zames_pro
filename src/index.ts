#!/usr/bin/env node
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { theme } from './theme.js'

import { DeepSeekBrowser } from './browser.js'
import { createTools } from './tools.js'
import { runAgentLoop } from './agent-loop.js'
import { createSpinner } from './spinner.js'
import { LineEditor, expandPastes, pasteReplacement, type PasteBlock } from './input.js'
import {
  parseImagePaste,
  extForMime,
  saveToTemp,
  guessMime,
  isImageName,
  formatSize,
  looksLikeFilePath,
  readClipboardImageDetailed,
  sniffMime,
} from './attachments.js'
import {
  loadConfig,
  DEFAULTS,
  CONFIG_PATHS,
  ZAMES_HOME,
  CONFIG_SCHEMA,
  getByPath,
  validateConfigValue,
  writeConfigValue,
  resetConfigValue,
  type ConfigField,
} from './config.js'
import { runConfigMenu } from './config-menu.js'
import {
  translate,
  normalizeLocale,
  localeDisplayName,
  isLocale,
  type Locale,
} from './i18n.js'
import { Transcript } from './transcript.js'
import { UndoStore } from './undo.js'
import { selfReview, selfDiff, selfApply, selfList } from './self-review.js'
import { closeWeb } from './web.js'
import {
  saveSession,
  loadLastSession,
  listSessions,
  sessionsDir,
} from './sessions.js'
import type { ToolDef } from './types.js'
import type { ChatInfo } from './browser.js'

interface PendingMessage {
  text: string
  attachments?: Array<{ path: string; name: string; mime: string }>
}

interface RunTaskOptions {
  transcript: Transcript
  freshChat: boolean
  sendSystemPrompt: boolean
  queue?: PendingMessage[]
  ui?: LineEditor | null
  onChatReady?: (chatId: string | null) => void
}

interface ReviewMode {
  snapDir: string
  snapName: string
  originalWorkdir: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------- CLI parsing ----------

const args = process.argv.slice(2)

function getArg(flag: string, fallback: string | null = null): string | null {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

function hasFlag(flag: string): boolean {
  return args.includes(flag)
}

function getPositional(): string[] {
  const positional = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (['--dir', '--task', '--max-iter', '--project', '--chat'].includes(a)) {
      i++
      continue
    }
    if (a.startsWith('--')) continue
    positional.push(a)
  }
  return positional
}

const config = loadConfig()

// Current interface/agent language. Changed by the /config lang <ru|en> command.
let currentLocale: Locale = isLocale(config.ui?.locale)
  ? config.ui.locale
  : 'ru'
// Translation: reads currentLocale at call time, so a language change takes
// effect immediately, without a restart (for lines printed afterwards).
const t = (key: string, params?: Record<string, string | number>): string =>
  translate(currentLocale)(key, params)

const headless = hasFlag('--headless') || config.headless
const debug = hasFlag('--debug') || config.debug
const calibrate = hasFlag('--calibrate')
const maxIter =
  Number(getArg('--max-iter', String(config.maxIterations))) ||
  config.maxIterations

const positional = getPositional()
const task = getArg('--task', positional.join(' ').trim() || null)
const chatIdArg = getArg('--chat', null)
// When resuming an existing chat, the system-prompt is by default NOT
// resent (it is already at the start of the chat). The --resend-prompt flag
// forces resending it — for example, if the prompt was updated.
const resendPrompt = hasFlag('--resend-prompt')
// By default a NEW chat is started on launch (context is not carried over).
// --resume-last: return to the last session for the working directory.
// --new-chat: kept for compatibility — this is the default behavior anyway.
const newChatFlag = hasFlag('--new-chat')
const resumeLastFlag = hasFlag('--resume-last')

// ---------- session persistence ----------
// We store sessions (DeepSeek chats) in ~/.zames/.sessions so they survive
// a restart and are available for explicit restore (--resume-last,
// --chat <id>, /resume <n>). They are NOT brought up automatically on launch.
// Previously there was a single last-chat.json file that got lost when the
// project changed and gave no list of sessions to restore.
function saveLastChat(id: string | null, workdir = '', title = ''): void {
  if (!id) return
  saveSession({ id, workdir, title })
}

function loadLastChat(workdir = ''): string | null {
  const s = loadLastSession(workdir)
  return s ? s.id : null
}

// ---------- hot reload ----------
// We keep references to the logic modules in the mod object. The /reload
// command re-reads them via a dynamic import with a timestamp query — Node
// caches ESM by URL, so such an import returns a fresh version of the module.
// The browser, chat and current state are NOT restarted: only the logic is updated.
// In dev mode tsx loads the .ts sources from src/, and in the built dist — .js.
// A dynamic import with the ?t= query bypasses tsx's extension rewriting,
// so we pick the extension ourselves — from the actual file of the current module.
const SRC_EXT = /[.]ts$/.test(new URL(import.meta.url).pathname) ? '.ts' : '.js'
const RELOADABLE = [
  'tools',
  'agent-loop',
  'system-prompt',
  'gitTools',
  'web',
  'self-review',
  'diff',
  'undo',
  'confirm',
  'transcript',
  'spinner',
  'config',
]

interface ModBag {
  createTools: typeof createTools
  runAgentLoop: typeof runAgentLoop
  buildSystemPrompt: typeof import('./system-prompt.js').buildSystemPrompt
  selfReview: typeof selfReview
  selfDiff: typeof selfDiff
  selfApply: typeof selfApply
  selfList: typeof selfList
  closeWeb: typeof closeWeb
  createSpinner: typeof createSpinner
}

const mod: ModBag = {
  createTools,
  runAgentLoop,
  buildSystemPrompt: null as unknown as ModBag['buildSystemPrompt'],
  selfReview,
  selfDiff,
  selfApply,
  selfList,
  closeWeb,
  createSpinner,
}

async function reloadModules(): Promise<{ count: number; errors: string[] }> {
  const stamp = Date.now()
  const loaded = new Map<string, Record<string, unknown>>()
  const errors: string[] = []
  for (const base of RELOADABLE) {
    const rel = './' + base + SRC_EXT
    try {
      const url = new URL(rel, import.meta.url)
      url.searchParams.set('t', String(stamp))
      const m = (await import(url.href)) as Record<string, unknown>
      loaded.set(base, m)
    } catch (e) {
      errors.push(rel + ': ' + (e as Error).message)
    }
  }

  const pick = (base: string, name: string): unknown => loaded.get(base)?.[name]

  if (pick('tools', 'createTools'))
    mod.createTools = pick('tools', 'createTools') as ModBag['createTools']
  if (pick('agent-loop', 'runAgentLoop'))
    mod.runAgentLoop = pick(
      'agent-loop',
      'runAgentLoop',
    ) as ModBag['runAgentLoop']
  if (pick('system-prompt', 'buildSystemPrompt'))
    mod.buildSystemPrompt = pick(
      'system-prompt',
      'buildSystemPrompt',
    ) as ModBag['buildSystemPrompt']
  if (pick('self-review', 'selfReview'))
    mod.selfReview = pick('self-review', 'selfReview') as ModBag['selfReview']
  if (pick('self-review', 'selfDiff'))
    mod.selfDiff = pick('self-review', 'selfDiff') as ModBag['selfDiff']
  if (pick('self-review', 'selfApply'))
    mod.selfApply = pick('self-review', 'selfApply') as ModBag['selfApply']
  if (pick('self-review', 'selfList'))
    mod.selfList = pick('self-review', 'selfList') as ModBag['selfList']
  if (pick('web', 'closeWeb'))
    mod.closeWeb = pick('web', 'closeWeb') as ModBag['closeWeb']
  if (pick('spinner', 'createSpinner'))
    mod.createSpinner = pick(
      'spinner',
      'createSpinner',
    ) as ModBag['createSpinner']

  return { count: loaded.size, errors }
}

// Initial load so that mod.buildSystemPrompt and the rest are populated.
await reloadModules()

// Dev mode: auto-reload of the logic modules before each task.
// Enabled by the --dev flag (`npm run dev` sets it) or config.hotReload === true.
// In normal mode (npm start, global zames) auto-reload is off.
const devMode = hasFlag('--dev') || config.hotReload === true

// Safe auto-reload: on a load error we keep the previous working modules.
async function autoReload(): Promise<void> {
  if (!devMode) return
  const { errors } = await reloadModules()
  if (errors.length) {
    console.error(theme.warn(t('reload.auto_partial')))
    for (const e of errors) console.error(theme.warn('  ' + e))
  }
}

// ---------- helpers ----------

function printHelp(): void {
  console.log(`
${theme.bold('zames')} — ${t('app.tagline')}

${theme.bold(t('help.options'))}
  --dir <path>       ${t('help.opt.dir')}
  --task <text>      ${t('help.opt.task')}
  --chat <id>        ${t('help.opt.chat')}
  --resume-last      ${t('help.opt.resume_last')}
  --new-chat         ${t('help.opt.new_chat')}
  --resend-prompt    ${t('help.opt.resend_prompt')}
  --max-iter <n>     ${t('help.opt.max_iter', { n: config.maxIterations })}
  --headless         ${t('help.opt.headless')}
  --debug            ${t('help.opt.debug')}
  --calibrate        ${t('help.opt.calibrate')}
  --dev              ${t('help.opt.dev')}
  --version, -v      ${t('help.opt.version')}
  --help, -h         ${t('help.opt.help')}

${theme.bold(t('help.while_working'))}
  ${t('help.key.queue')}
  ${t('help.key.history')}
  ${t('help.key.words')}
  ${t('help.key.slash')}
  ${t('help.key.newline')}
  ${t('help.key.backslash')}
  ${t('help.key.attach')}
  ${t('help.key.esc')}

${theme.bold(t('help.commands'))}
  ${t('help.cmd.new')}
  ${t('help.cmd.sessions')}
  ${t('help.cmd.resume_id')}
  ${t('help.cmd.chats')}
  ${t('help.cmd.resume')}
  ${t('help.cmd.chat')}
  ${t('help.cmd.cd')}
  ${t('help.cmd.pwd')}
  ${t('help.cmd.status')}
  ${t('help.cmd.reload')}
  ${t('help.cmd.undo')}
  ${t('help.cmd.undo_list')}
  ${t('help.cmd.transcript')}
  ${t('help.cmd.config')}
  ${t('help.cmd.lang')}
  ${t('help.cmd.debug_dom')}
  ${t('help.cmd.help')}
  ${t('help.cmd.exit')}

${theme.bold(t('help.self_review'))}
  ${t('help.self.review')}
  ${t('help.self.fix')}
  ${t('help.self.done')}
  ${t('help.self.list')}
  ${t('help.self.diff')}
  ${t('help.self.apply')}

${theme.bold(t('help.files'))}
  ${t('help.files.logs')}        ${config.transcript.dir}
  ${t('help.files.undo')}        ~/.zames/undo
  ${t('help.files.sessions')}      ${sessionsDir()}
  ${t('help.files.profile')}     ~/.zames/profile
  ${t('help.files.snapshots')}    ~/.zames/snapshots
  ${t('help.files.tmp')}   <project>/tmp (.gitignore, cleaned on start)
  ${t('help.files.config')}      ${CONFIG_PATHS.HOME_CONFIG}
               ${CONFIG_PATHS.PROJECT_CONFIG}
`)
}

function dirLabel(p: string): string {
  return path.basename(p) || p
}

// List of slash commands for completion when you type «/» (Tab — complete).
// The description is localized by the help.cmd.* key at display time — see
// buildSlashCommands().
const SLASH_COMMANDS: Array<{ name: string; key: string }> = [
  { name: '/help', key: 'help.cmd.help' },
  { name: '/new', key: 'help.cmd.new' },
  { name: '/clear', key: 'help.cmd.new' },
  { name: '/sessions', key: 'help.cmd.sessions' },
  { name: '/chats', key: 'help.cmd.chats' },
  { name: '/resume', key: 'help.cmd.resume' },
  { name: '/resume-id', key: 'help.cmd.resume_id' },
  { name: '/chat', key: 'help.cmd.chat' },
  { name: '/cd', key: 'help.cmd.cd' },
  { name: '/pwd', key: 'help.cmd.pwd' },
  { name: '/status', key: 'help.cmd.status' },
  { name: '/reload', key: 'help.cmd.reload' },
  { name: '/undo', key: 'help.cmd.undo' },
  { name: '/undo-list', key: 'help.cmd.undo_list' },
  { name: '/transcript', key: 'help.cmd.transcript' },
  { name: '/config', key: 'help.cmd.config' },
  { name: '/debug-dom', key: 'help.cmd.debug_dom' },
  { name: '/self-review', key: 'help.self.review' },
  { name: '/self-fix', key: 'help.self.fix' },
  { name: '/self-done', key: 'help.self.done' },
  { name: '/self-list', key: 'help.self.list' },
  { name: '/self-diff', key: 'help.self.diff' },
  { name: '/self-apply', key: 'help.self.apply' },
  { name: '/exit', key: 'help.cmd.exit' },
  { name: '/quit', key: 'help.cmd.exit' },
]

// Slash-command descriptions in the current language (for LineEditor hints).
function buildSlashCommands(): Array<{ name: string; description: string }> {
  return SLASH_COMMANDS.map((c) => ({
    name: c.name,
    description: t(c.key),
  }))
}

// We put the agent's temporary files (one-off scripts, etc.) in
// <project>/tmp — this folder is in .gitignore and is cleaned on every launch.
const TMP_DIR = path.join(__dirname, '..', 'tmp')

// Resolve a pasted string into a path to an existing file. Handles quoted
// paths (drag&drop from some file managers adds quotes) and paths relative to
// the working directory.
async function resolveAttachPath(workdir: string, raw: string): Promise<string | null> {
  let s = String(raw || '').trim()
  if (!s) return null
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1)
  }
  s = s.replace(/\\ /g, ' ')
  if (!looksLikeFilePath(s) && !isImageName(s)) return null
  const candidates = path.isAbsolute(s) ? [s] : [path.resolve(workdir, s)]
  for (const c of candidates) {
    const st = await fs.stat(c).catch(() => null)
    if (st && st.isFile()) return c
  }
  return null
}

async function cleanTmpDir(): Promise<void> {
  try {
    await fs.rm(TMP_DIR, { recursive: true, force: true })
    await fs.mkdir(TMP_DIR, { recursive: true })
  } catch (e) {
    if (debug) console.error('tmp: не удалось очистить:', (e as Error).message)
  }
}

// Terminal line input with correct paste handling (Shift+Insert,
// Ctrl+Shift+V, right mouse button, etc.).
//
// Why a custom reader instead of readline:
//   1) readline submits the line on the FIRST newline. When pasting
//      multiline text this caused immediate submission and only the first
//      line went to the chat. Here newlines inside a paste are replaced with
//      spaces, and submission happens only on a single Enter press.
//   2) We enable bracketed paste mode (\x1b[?2004h): the terminal wraps the
//      pasted text in the markers \x1b[200~ … \x1b[201~, so we know for sure
//      that this is a paste, not keyboard typing, and Enter inside it is not
//      treated as submission.
async function promptOnce(question: string): Promise<string> {
  const stdin = process.stdin
  const stdout = process.stdout

  // Non-TTY (pipe, redirect): read everything up to EOF as a single string.
  if (!stdin.isTTY || !stdin.setRawMode) {
    const chunks: Buffer[] = []
    return await new Promise((resolve) => {
      const onData = (b: Buffer) => chunks.push(b)
      const onEnd = () => {
        stdin.removeListener('data', onData)
        stdin.removeListener('end', onEnd)
        resolve(Buffer.concat(chunks).toString('utf-8'))
      }
      stdin.on('data', onData)
      stdin.on('end', onEnd)
      stdin.resume()
    })
  }

  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)
  stdin.resume()

  // We enable/disable bracketed paste in pairs.
  stdout.write('\x1b[?2004h')
  stdout.write(question)

  let line = ''
  let cursor = 0
  let inPaste = false
  const PASTE_START = '\x1b[200~'
  const PASTE_END = '\x1b[201~'

  const redraw = () => {
    // Return to the start of the line, erase and print again.
    stdout.write(String.fromCharCode(13))
    stdout.write('\x1b[K')
    stdout.write(question + line)
    // Put the cursor in the right position.
    const back = line.length - cursor
    if (back > 0) stdout.write('\x1b[' + back + 'D')
  }

  return await new Promise((resolve) => {
    const finish = (value: string, submit: boolean) => {
      stdin.removeListener('data', onData)
      stdout.write('\x1b[?2004l')
      if (stdin.setRawMode) stdin.setRawMode(wasRaw || false)
      if (submit) stdout.write(String.fromCharCode(10))
      resolve(value)
    }

    const insertText = (text: string) => {
      // Normalize newlines: they come from a multiline paste but mean
      // "submit". Inside the message we replace them with a space so the
      // whole paste goes as ONE message.
      const clean = text
        .replace(/\r\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\n/g, ' ')
      line = line.slice(0, cursor) + clean + line.slice(cursor)
      cursor += clean.length
    }

    const onData = (buf: Buffer) => {
      let s = buf.toString('utf-8')

      // Fallback for terminals without bracketed paste: if the whole chunk is
      // a "bare" newline (one byte), then Enter was pressed → submit.
      // If newlines came TOGETHER with other text in one chunk — that's a
      // paste; such newlines don't submit the message but are replaced with
      // spaces (see insertText).
      if (!inPaste && (s === '\r' || s === '\n')) {
        return finish(line, true)
      }

      while (s.length) {
        if (inPaste) {
          const end = s.indexOf(PASTE_END)
          if (end === -1) {
            insertText(s)
            s = ''
          } else {
            insertText(s.slice(0, end))
            s = s.slice(end + PASTE_END.length)
            inPaste = false
          }
          redraw()
          continue
        }

        const start = s.indexOf(PASTE_START)
        if (start !== -1) {
          // Everything before the marker is processed as regular input.
          const before = s.slice(0, start)
          s = s.slice(start + PASTE_START.length)
          inPaste = true
          if (before) {
            for (const ch of before) {
              if (ch === '\r' || ch === '\n') {
                /* inside a paste — skip */
              } else insertText(ch)
            }
            redraw()
          }
          continue
        }

        const ch = s[0]
        const code = s.charCodeAt(0)
        s = s.slice(1)

        if (ch === '\r' || ch === '\n') {
          // A newline inside a chunk with other text (paste without
          // bracketed paste): don't submit, insert a space instead.
          insertText(' ')
          redraw()
          continue
        }
        if (code === 3) {
          // Ctrl+C — abort input.
          return finish('', true)
        }
        if (code === 4) {
          // Ctrl+D — like submitting an empty line.
          return finish(line, true)
        }
        if (code === 21) {
          // Ctrl+U — erase the line.
          line = ''
          cursor = 0
          redraw()
          continue
        }
        if (code === 127 || code === 8) {
          // Backspace.
          if (cursor > 0) {
            line = line.slice(0, cursor - 1) + line.slice(cursor)
            cursor--
            redraw()
          }
          continue
        }
        if (ch === '\x1b') {
          // Escape sequences (arrows, Home/End, Delete…).
          const rest = s
          if (rest.startsWith('[D')) {
            if (cursor > 0) cursor--
            s = s.slice(2)
            redraw()
            continue
          }
          if (rest.startsWith('[C')) {
            if (cursor < line.length) cursor++
            s = s.slice(2)
            redraw()
            continue
          }
          if (rest.startsWith('[H') || rest.startsWith('[1~')) {
            cursor = 0
            s = s.slice(rest.startsWith('[1~') ? 3 : 2)
            redraw()
            continue
          }
          if (rest.startsWith('[F') || rest.startsWith('[4~')) {
            cursor = line.length
            s = s.slice(rest.startsWith('[4~') ? 3 : 2)
            redraw()
            continue
          }
          if (rest.startsWith('[3~')) {
            // Delete.
            if (cursor < line.length) {
              line = line.slice(0, cursor) + line.slice(cursor + 1)
              redraw()
            }
            s = s.slice(3)
            continue
          }
          // Other ESC sequences are skipped up to a letter/tilde.
          const m = s.match(/^\[[0-9;]*[A-Za-z~]/)
          if (m) s = s.slice(m[0].length)
          continue
        }
        if (code < 32) continue // other control characters are ignored

        insertText(ch)
        redraw()
      }
    }

    stdin.on('data', onData)
  })
}

// Keyboard monitoring while the agent works.
//
// The terminal stays live while the agent thinks:
//   - Esc (or Ctrl+C) — abort the current generation (a Stop click in the browser);
//   - typing + Enter — queue a message; it goes to the agent right after
//     the current task finishes (like "send during generation" in the
//     DeepSeek web version).
//
// Input is buffered without a line editor: the typed text is shown in the
// spinner line via onChange -> ui.setPending(). Enter sends the buffer to
// onQueue, an empty Enter is ignored. Backspace, Ctrl+U, Esc sequences
// (arrows/Home/End/Delete are ignored) and bracketed paste are supported.
function watchInput({
  onEscape,
  onChange,
  onQueue,
}: {
  onEscape?: () => void
  onChange?: (text: string) => void
  onQueue?: (text: string) => void
} = {}): () => void {
  const stdin = process.stdin
  if (!stdin.isTTY || !stdin.setRawMode) return () => {}

  // Control characters are assembled from codes: this file must not contain
  // "raw" ESC/CR/LF in string literals (see AGENTS.md).
  const ESC = String.fromCharCode(27)
  const CSI = String.fromCharCode(91)
  const CR = String.fromCharCode(13)
  const LF = String.fromCharCode(10)

  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)
  stdin.resume()
  process.stdout.write(ESC + '[?2004h')

  let buf = ''
  let inPaste = false
  let pasteBuf = ''
  const pastes: PasteBlock[] = []
  const PASTE_START = ESC + '[200~'
  const PASTE_END = ESC + '[201~'
  const CSI_RE = new RegExp('^' + CSI + '[0-9;]*[A-Za-z~]')

  const emitChange = (): void => {
    if (onChange) onChange(buf)
  }

  // Pasted text: small pastes (1–2 lines) are flattened into one line;
  // large ones (3+ lines) are collapsed into "[Pasted lines#N]" (the original
  // text is expanded back when the message is queued).
  const insert = (text: string) => {
    buf += text
      .split(CR + LF)
      .join(' ')
      .split(CR)
      .join(' ')
      .split(LF)
      .join(' ')
  }

  const insertPaste = (raw: string) => {
    const rep = pasteReplacement(raw)
    if (!rep) {
      insert(raw)
      return
    }
    pastes.push(rep)
    buf += rep.marker
  }

  function onData(data: Buffer) {
    let s = data.toString('utf-8')

    // A single Esc — abort generation. Arrows come as a whole chunk and
    // don't reach here.
    if (!inPaste && s === ESC) {
      if (onEscape) onEscape()
      return
    }

    while (s.length) {
      if (inPaste) {
        const end = s.indexOf(PASTE_END)
        if (end === -1) {
          pasteBuf += s
          s = ''
        } else {
          pasteBuf += s.slice(0, end)
          s = s.slice(end + PASTE_END.length)
          inPaste = false
          insertPaste(pasteBuf)
          pasteBuf = ''
        }
        emitChange()
        continue
      }

      const start = s.indexOf(PASTE_START)
      if (start !== -1) {
        const before = s.slice(0, start)
        s = s.slice(start + PASTE_START.length)
        inPaste = true
        pasteBuf = ''
        if (before) {
          insert(before)
          emitChange()
        }
        continue
      }

      const ch = s[0]
      const code = s.charCodeAt(0)
      s = s.slice(1)

      if (ch === CR || ch === LF) {
        const text = expandPastes(pastes, buf).trim()
        buf = ''
        pastes.length = 0
        emitChange()
        if (text && onQueue) onQueue(text)
        continue
      }
      if (code === 3) {
        // Ctrl+C — like Esc: abort generation.
        if (onEscape) onEscape()
        continue
      }
      if (code === 21) {
        // Ctrl+U — clear what was typed.
        buf = ''
        pastes.length = 0
        emitChange()
        continue
      }
      if (code === 127 || code === 8) {
        // Backspace.
        if (buf) {
          buf = buf.slice(0, -1)
          emitChange()
        }
        continue
      }
      if (ch === ESC) {
        // Escape sequence (arrows, Home/End, Delete) — skip.
        const m = s.match(CSI_RE)
        if (m) s = s.slice(m[0].length)
        continue
      }
      if (code < 32) continue // other control characters — ignore

      buf += ch
      emitChange()
    }
  }

  const handler = (data: Buffer) => onData(data)
  stdin.on('data', handler)
  return () => {
    stdin.removeListener('data', handler)
    process.stdout.write(ESC + '[?2004l')
    if (stdin.setRawMode) stdin.setRawMode(wasRaw || false)
  }
}

// ---------- workdir resolution ----------

// The agent works in the directory it was launched from (process.cwd()).
// This is the sandbox root: tools cannot go above it.
async function resolveWorkdir(): Promise<string> {
  const explicitDir = getArg('--dir', null)
  const dir = explicitDir ? path.resolve(explicitDir) : process.cwd()
  const stat = await fs.stat(dir).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error('Не директория: ' + dir)
  }
  return dir
}

// ---------- task runner ----------

async function runTask(
  browser: DeepSeekBrowser,
  tools: ToolDef[],
  taskText: string,
  workdir: string,
  opts: RunTaskOptions,
  attachments: Array<{ path: string; name: string; mime: string }> = [],
): Promise<void> {
  const {
    transcript,
    freshChat,
    sendSystemPrompt,
    queue = [],
    ui: editor,
    onChatReady,
  } = opts

  // In TTY mode the UI is a LineEditor: it owns the input (queue, Esc,
  // Ctrl+C) and draws the status ABOVE the permanent input line. In non-TTY
  // mode (pipes) — a regular spinner + watchInput.
  // A new task from the prompt — we reset the "stop" from the previous abort.
  browser._stopped = false
  browser._abort = false

  const ui = editor || mod.createSpinner(currentLocale)
  const stopWatching = editor
    ? () => {}
    : watchInput({
        onEscape: () => {
          ui.stop()
          console.error(theme.warn(t('msg.abort_gen_short')))
          browser.stopGeneration().catch(() => {})
        },
        onChange: (text) => ui.setPending(text),
        onQueue: (text) => {
          queue.push({ text })
          ui.setPending(null)
          ui.stop()
          console.log(
            theme.user(t('msg.queued', { n: queue.length })) +
              theme.assistant(text),
          )
          ui.thinking()
        },
      })

  try {
    let next: PendingMessage & { freshChat: boolean; sendSystemPrompt: boolean } = {
      text: taskText,
      attachments,
      freshChat,
      sendSystemPrompt,
    }

    // Execute the task, then everything the user managed to type while it
    // ran. The queue may be replenished right during draining.
    while (true) {
      ui.thinking()
      await mod.runAgentLoop({
        browser,
        tools,
        task: next.text,
        workdir,
        maxIterations: maxIter,
        freshChat: next.freshChat,
        sendSystemPrompt: next.sendSystemPrompt,
        attachments: next.attachments || [],
        transcript,
        onThinking: () => ui.thinking(),
        onToolCall: (name, toolArgs) => ui.toolCall(name, toolArgs),
        onToolResult: (result) => ui.toolResult(result),
        onAssistantMessage: (msg) => ui.assistant(msg),
        onWarning: (msg) => ui.warning(msg),
        onChatReady,
        debugLog: debug,
        locale: currentLocale,
      })

      // Aborted (Esc/Ctrl+C) — we don't start the next tasks from the queue
      // and clear it, so "stop" really stops everything.
      if (browser._stopped) {
        queue.length = 0
        break
      }
      if (!queue.length) break

      const queued = queue.shift() ?? { text: '' }
      ui.stop()
      if (editor) {
        editor.printAbove(
          theme.user(t('msg.from_queue')) + theme.assistant(queued.text),
        )
      } else {
        console.log(
          theme.user(t('msg.from_queue')) + theme.assistant(queued.text),
        )
      }
      transcript?.log('queued_task', { task: queued.text })
      next = {
        text: queued.text,
        attachments: queued.attachments,
        freshChat: false,
        sendSystemPrompt: false,
      }
    }
  } catch (e) {
    ui.stop()
    console.error(
      theme.error(String.fromCharCode(10) + t('msg.agent_error')),
      (e as Error).message,
    )
    if (debug) console.error((e as Error).stack)
    transcript?.log('agent_error', { error: (e as Error).message })
  } finally {
    stopWatching()
    ui.stop()
  }
}

// ---------- main ----------

async function main(): Promise<void> {
  if (hasFlag('--version') || hasFlag('-v')) {
    const pkg = JSON.parse(
      await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf-8'),
    )
    console.log(pkg.version)
    return
  }

  if (hasFlag('--help') || hasFlag('-h')) {
    printHelp()
    return
  }

  if (calibrate) {
    console.log(theme.warn(t('calibrate')))
  }

  await cleanTmpDir()

  let currentWorkdir: string
  let sandboxRoot: string
  try {
    currentWorkdir = await resolveWorkdir()
    // Sandbox root: the agent cannot go above the launch directory.
    sandboxRoot = currentWorkdir
  } catch (e) {
    console.error(
      theme.error(t('msg.workdir_error')),
      (e as Error).message,
    )
    process.exit(1)
  }

  console.log(theme.system(t('msg.working_dir', { v: currentWorkdir })))

  const transcript = new Transcript({
    dir: config.transcript.dir,
    enabled: config.transcript.enabled,
    sessionName: dirLabel(currentWorkdir),
  })
  if (transcript.file) {
    console.log(theme.system(t('msg.transcript', { v: transcript.file })))
  }

  const undo = new UndoStore(config.undo)

  const browser = new DeepSeekBrowser({
    headless,
    debug,
    channel: config.browserChannel,
    ...config.browser,
  })

  const bootSpinner = mod.createSpinner(currentLocale)
  bootSpinner.thinking()

  try {
    await browser.launch()
    bootSpinner.stop()
    await browser.waitForLogin()
  } catch (e) {
    bootSpinner.stop()
    console.error(
      theme.error(t('msg.browser_error')),
      (e as Error).message,
    )
    if (debug) console.error((e as Error).stack)
    await browser.close().catch(() => {})
    transcript.close()
    process.exit(1)
  }

  // One-shot mode
  if (task) {
    const tools = mod.createTools(currentWorkdir, { undo })

    let freshChat = true
    let sendSystemPrompt = true

    // By default we start a new chat. To continue a previous session —
    // explicitly: --chat <id> or --resume-last.
    let resumeId = chatIdArg
    if (!resumeId && resumeLastFlag && !newChatFlag) {
      const last = loadLastSession(currentWorkdir)
      if (last && last.id) {
        resumeId = last.id
        console.log(theme.system(t('msg.resuming', { id: resumeId })))
      }
    }

    if (resumeId) {
      try {
        console.log(theme.system(t('msg.opening_chat', { id: resumeId })))
        await browser.openChat(resumeId)
        freshChat = false
        sendSystemPrompt = resendPrompt
        saveLastChat(resumeId, currentWorkdir)
      } catch (e) {
        console.error(
          theme.error(t('msg.open_chat_error', { v: (e as Error).message })),
        )
      }
    }

    await autoReload()

    await runTask(browser, tools, task, currentWorkdir, {
      transcript,
      freshChat,
      sendSystemPrompt,
      onChatReady: (chatId) => {
        if (chatId) saveLastChat(chatId, currentWorkdir)
      },
    })
    await browser.close()
    await mod.closeWeb().catch(() => {})
    transcript.close()
    return
  }

  console.log(theme.system(t('msg.interactive')))
  console.log(theme.system(t('msg.queue_hint')))

  let freshChatNext = true
  let sendSystemPromptNext = true
  let lastChats: ChatInfo[] = []
  let currentChatId: string | null = null
  let running = true

  // Messages the user typed while the agent worked. runTask takes them one
  // by one after the current task finishes.
  const pendingQueue: PendingMessage[] = []
  // Attachments for the next submit (filled by the editor's onAttachments).
  let pendingAttachments: Array<{ path: string; name: string; mime: string }> = []
  // Show the "no clipboard image" hint only once per session.
  let clipboardWarned = false

  // ---------- review mode state ----------
  // null — normal mode.
  // { snapDir, snapName, originalWorkdir } — we're inside a snapshot, the chat
  // is already initialized with the review prompt, the user can just type "fix...".
  let reviewMode: ReviewMode | null = null

  process.on('SIGINT', async () => {
    running = false
    await browser.close().catch(() => {})
    // Close the lazy headless browser from web.js, otherwise it would stay
    // as a separate process after the agent exits.
    await mod.closeWeb().catch(() => {})
    transcript.close()
    console.log(theme.system(String.fromCharCode(10) + t('msg.bye')))
    process.exit(0)
  })

  // By default we start a NEW chat on launch: the context of a previous
  // session is not carried over automatically. To continue a previous
  // session explicitly:
  //   --chat <id>     open a specific chat
  //   --resume-last   return to the last chat for this working directory
  //   --new-chat      kept for compatibility (this is the default behavior)
  let resumeId = chatIdArg
  if (!resumeId && resumeLastFlag && !newChatFlag) {
    const last = loadLastSession(currentWorkdir)
    if (last && last.id) {
      resumeId = last.id
      console.log(
        theme.system(
          `Восстанавливаю сессию ${last.id}${last.title ? ` (${last.title})` : ''}...`,
        ),
      )
    }
  }

  if (resumeId) {
    try {
      console.log(theme.system(t('msg.opening_chat', { id: resumeId })))
      await browser.openChat(resumeId)
      currentChatId = resumeId
      freshChatNext = false
      sendSystemPromptNext = resendPrompt
      saveLastChat(resumeId, currentWorkdir)
      console.log(theme.system(t('msg.chat_opened') + ' ' + resumeId + String.fromCharCode(10)))
    } catch (e) {
      console.error(
        theme.error(t('msg.open_chat_error', { v: (e as Error).message })),
      )
    }
  }

  // ---------- input: permanent line below + status above ----------
  // In TTY we use LineEditor: it owns the input all the time, shows the
  // status above the input line and prints the agent's answers ABOVE it, so
  // the typed text is never overwritten by output. In non-TTY (pipe) —
  // the old promptOnce.
  let editor: LineEditor | null = null
  let waiter: ((v: PendingMessage | null) => void) | null = null
  const takeInput = (): Promise<PendingMessage | null> => {
    if (pendingQueue.length) return Promise.resolve(pendingQueue.shift() ?? null)
    return new Promise<PendingMessage | null>((resolve) => {
      waiter = resolve
    })
  }

  const buildPrompt = () => {
    let tail
    if (reviewMode) {
      tail =
        theme.warn(t('prompt.review')) + theme.dim(':') + theme.dir(reviewMode.snapName)
    } else {
      tail = theme.dir(dirLabel(currentWorkdir))
    }
    return theme.prompt('❯ ') + tail + theme.dim(' › ')
  }

  if (process.stdin.isTTY && process.stdout.isTTY) {
    const ed = new LineEditor({
      prompt: buildPrompt(),
      commands: buildSlashCommands(),
    })
    editor = ed
    ed.setTmpDir(TMP_DIR)
    ed.onAttach = async (raw: string) => {
      // Case 1: the paste is the image data itself (data URL / base64 blob).
      const image = parseImagePaste(raw)
      if (image) {
        const name = 'paste' + extForMime(image.mime)
        const p = await saveToTemp(TMP_DIR, name, image.data)
        const att = ed.attachments.add({
          path: p,
          name,
          mime: image.mime,
          size: image.data.length,
        })
        ed.printAbove(
          theme.system(
            t('msg.attached_image', { marker: att.marker, size: formatSize(image.data.length) }),
          ),
        )
        return att
      }
      // Case 2: the paste is a path to a local file (drag&drop or copy path).
      const filePath = await resolveAttachPath(currentWorkdir, raw)
      if (!filePath) return null
      const data = await fs.readFile(filePath).catch(() => null)
      if (!data) return null
      const name = path.basename(filePath)
      const mime = guessMime(name)
      const att = ed.attachments.add({
        path: filePath,
        name,
        mime,
        size: data.length,
      })
      ed.printAbove(
        theme.system(
          t('msg.attached_file', { marker: att.marker, name, size: formatSize(data.length) }),
        ),
      )
      return att
    }
    ed.onClipboard = async () => {
      const res = readClipboardImageDetailed()
      if (!res.data || !res.data.length) {
        if (!clipboardWarned) {
          clipboardWarned = true
          ed.printAbove(
            theme.warn(
              t('msg.clip_empty', { via: res.via }) +
                String.fromCharCode(10) +
                t('msg.clip_hint'),
            ),
          )
        }
        return null
      }
      const mime = sniffMime(res.data) || 'image/png'
      const name = 'clipboard-' + Date.now() + (extForMime(mime) || '.png')
      const p = await saveToTemp(TMP_DIR, name, res.data)
      const att = ed.attachments.add({
        path: p,
        name,
        mime,
        size: res.data.length,
      })
      ed.printAbove(
        theme.system(
          t('msg.attached_image', {
            marker: att.marker,
            size: formatSize(res.data.length),
          }) + theme.dim('  (' + res.via + ')'),
        ),
      )
      return att
    }
    ed.onSubmit = (text: string, items) => {
      const attachments = (items || []).map((a) => ({
        path: a.path,
        name: a.name,
        mime: a.mime,
      }))
      const msg: PendingMessage = { text, attachments }
      pendingQueue.push(msg)
      if (waiter) {
        const r = waiter
        waiter = null
        r(pendingQueue.shift() ?? null)
      }
    }
    ed.onEscape = () => {
      if (ed.busy) {
        ed.printAbove(theme.warn(t('msg.abort_gen_short')))
        browser.stopGeneration().catch(() => {})
      }
    }
    ed.onCtrlC = () => {
      if (ed.busy) {
        ed.printAbove(theme.warn(t('msg.abort_ctrlc_short')))
        browser.stopGeneration().catch(() => {})
      } else {
        // Not busy — exit. We wake takeInput() so the loop finishes.
        running = false
        if (waiter) {
          const r = waiter
          waiter = null
          r(null)
        }
      }
    }
    ed.start()

    // All command output (console.log/error) must go ABOVE the input line,
    // otherwise it overwrites the text being typed. While the editor is
    // active, we wrap both streams in ed.printAbove.
    const origLog = console.log.bind(console)
    const origErr = console.error.bind(console)
    const fmt = (a: unknown): string =>
      typeof a === 'string'
        ? a
        : (() => {
            try {
              return JSON.stringify(a)
            } catch {
              return String(a)
            }
          })()
    console.log = (...a) => ed.printAbove(a.map(fmt).join(' '))
    console.error = (...a) => ed.printAbove(a.map(fmt).join(' '))
    // Save for debugging.
    const edAny = ed as unknown as Record<string, unknown>
    edAny._origLog = origLog
    edAny._origErr = origErr
  }

  // ---------- /config ----------
  // View and edit settings without a restart. Values are validated against
  // CONFIG_SCHEMA (src/config.ts) and written to the project .zamesrc.json.
  // The language (ui.locale) is applied immediately: we change currentLocale,
  // rebuild the editor hints and update config.ui.locale (agent-loop reads it
  // on the next task).
  //
  // With no arguments in an interactive terminal a menu opens (arrows,
  // Enter — edit, d — reset, q — quit). There are also text subcommands
  // (list/get/set/reset/lang/path) — for scripts and non-TTY.
  function setConfigRuntime(path: string, value: unknown): void {
    const segs = path.split('.')
    let obj: Record<string, unknown> = config as unknown as Record<string, unknown>
    for (let i = 0; i < segs.length - 1; i++) {
      obj = obj[segs[i]] as Record<string, unknown>
    }
    obj[segs[segs.length - 1]] = value
    if (path === 'ui.locale' && isLocale(value)) {
      currentLocale = value
      config.ui.locale = value
      if (editor) {
        editor.setCommands(buildSlashCommands())
        editor.setPrompt(buildPrompt())
      }
    }
  }

  function configSetRaw(field: ConfigField, raw: string): void {
    const value = validateConfigValue(field, raw)
    writeConfigValue('project', field.path, raw)
    setConfigRuntime(field.path, value)
  }

  function configResetField(field: ConfigField): void {
    resetConfigValue('project', field.path)
    // Reset the runtime value to the default.
    const def = getByPath(DEFAULTS, field.path)
    setConfigRuntime(field.path, def)
  }

  function configLabel(field: ConfigField): string {
    return t(field.labelKey)
  }

  function configShowList(): void {
    console.log(theme.system(t('cfg.title')))
    let lastGroup = ''
    for (const f of CONFIG_SCHEMA) {
      const g = t(f.groupKey)
      if (g !== lastGroup) {
        console.log(theme.system('\n  ' + g))
        lastGroup = g
      }
      const cur = getByPath(config, f.path)
      const shown =
        cur === undefined
          ? t('cfg.menu.default')
          : typeof cur === 'boolean'
            ? cur
              ? t('common.on')
              : t('common.off')
            : JSON.stringify(cur)
      const extra = f.values ? '  [' + f.values.join('|') + ']' : ''
      console.log(
        '    ' +
          theme.user(f.path) +
          theme.dim(' = ') +
          theme.assistant(shown) +
          theme.dim(extra) +
          theme.dim('   # ' + configLabel(f)),
      )
    }
    console.log(theme.dim('\n' + t('cfg.usage')))
  }

  async function configOpenMenu(): Promise<void> {
    if (!(process.stdin.isTTY && process.stdout.isTTY)) {
      configShowList()
      return
    }
    // The menu draws directly to stdout and reads keys itself. So that its
    // output doesn't overlap the LineEditor's permanent input line, we "pause"
    // the editor for the duration of the menu and restore it afterwards.
    if (editor) editor.pause()
    try {
      await runConfigMenu({
        fields: CONFIG_SCHEMA,
        t,
        get: (path) => getByPath(config, path),
        set: (field, raw) => configSetRaw(field, raw),
        reset: (field) => configResetField(field),
      })
    } catch (e) {
      console.error(theme.error(String((e as Error).message || e)))
    } finally {
      if (editor) editor.resume()
    }
  }

  async function handleConfigCommand(input: string): Promise<void> {
    const parts = input.trim().split(/\s+/)
    const sub = (parts[1] || '').toLowerCase()

    // With no subcommand — the menu (or a text list in non-TTY).
    if (!sub || sub === 'menu' || sub === 'ui') {
      await configOpenMenu()
      return
    }

    if (sub === 'list' || sub === 'show' || sub === 'ls') {
      configShowList()
      return
    }

    if (sub === 'path' || sub === 'paths') {
      console.log(
        theme.system(
          t('cfg.paths', {
            global: CONFIG_PATHS.HOME_CONFIG,
            project: CONFIG_PATHS.PROJECT_CONFIG,
          }),
        ),
      )
      return
    }

    // /config lang <ru|en> — quick access to ui.locale
    if (sub === 'lang' || sub === 'language' || sub === 'язык') {
      const val = parts[2]
      if (!val) {
        console.log(
          theme.system(
            t('status.locale', { v: localeDisplayName(currentLocale) }),
          ),
        )
        console.log(theme.dim(t('cfg.lang_usage')))
        return
      }
      const field = CONFIG_SCHEMA.find((f) => f.path === 'ui.locale')!
      const loc = normalizeLocale(val)
      try {
        configSetRaw(field, loc)
      } catch (e) {
        console.error(
          theme.error(t('cfg.write_error', { v: (e as Error).message })),
        )
        return
      }
      console.log(
        theme.assistant(t('cfg.lang_set', { v: localeDisplayName(loc) })),
      )
      return
    }

    if (sub === 'get') {
      const key = parts[2]
      if (!key) {
        console.log(theme.dim(t('cfg.usage')))
        return
      }
      const field = CONFIG_SCHEMA.find((f) => f.path === key)
      if (!field) {
        console.error(theme.error(t('cfg.unknown_key', { v: key })))
        return
      }
      const cur = getByPath(config, key)
      console.log(
        theme.system(
          t('cfg.value', {
            v: key,
            value:
              cur === undefined ? t('cfg.menu.default') : JSON.stringify(cur),
          }),
        ),
      )
      return
    }

    if (sub === 'set') {
      const key = parts[2]
      const raw = parts.slice(3).join(' ')
      const field = CONFIG_SCHEMA.find((f) => f.path === key)
      if (!field) {
        console.error(theme.error(t('cfg.unknown_key', { v: key || '' })))
        return
      }
      if (!raw) {
        console.log(theme.dim(t('cfg.usage')))
        return
      }
      try {
        configSetRaw(field, raw)
      } catch {
        console.error(
          theme.error(
            t('cfg.bad_value', {
              v: key,
              type: field.values ? field.values.join('|') : field.type,
            }),
          ),
        )
        return
      }
      console.log(
        theme.assistant(
          t('cfg.saved', {
            v: key,
            value: JSON.stringify(getByPath(config, key)),
          }),
        ),
      )
      return
    }

    if (sub === 'reset' || sub === 'unset') {
      const key = parts[2]
      const field = CONFIG_SCHEMA.find((f) => f.path === key)
      if (!field) {
        console.error(theme.error(t('cfg.unknown_key', { v: key || '' })))
        return
      }
      try {
        configResetField(field)
      } catch (e) {
        console.error(
          theme.error(t('cfg.write_error', { v: (e as Error).message })),
        )
        return
      }
      console.log(theme.assistant(t('cfg.reset', { v: key })))
      return
    }

    // Unknown subcommand — show the list.
    console.error(theme.error(t('cfg.unknown_key', { v: sub })))
    configShowList()
  }

  while (running) {
    let input: string | null
    let inputAttachments: Array<{ path: string; name: string; mime: string }> = []
    try {
      if (editor) {
        editor.setPrompt(buildPrompt())
        const msg = await takeInput()
        input = msg ? msg.text : null
        inputAttachments = msg?.attachments || []
      } else {
        let tail
        if (reviewMode) {
          tail =
            theme.warn(t('prompt.review')) +
            theme.dim(':') +
            theme.dir(reviewMode.snapName)
        } else {
          tail = theme.dir(dirLabel(currentWorkdir))
        }
        input = await promptOnce(theme.prompt('❯ ') + tail + theme.dim(' › '))
      }
    } catch {
      break
    }

    const trimmed = (input || '').trim()
    if (!trimmed) continue

    const lower = trimmed.toLowerCase()

    if (['/exit', '/quit', 'exit', 'quit'].includes(lower)) break

    if (lower === '/help' || lower === 'help') {
      printHelp()
      continue
    }

    if (['/new', '/clear', 'new'].includes(lower)) {
      console.log(theme.system(t('msg.new_chat')))
      try {
        await browser.newChat()
        freshChatNext = false
        sendSystemPromptNext = true
        currentChatId = await browser.getCurrentChatId()
        saveLastChat(currentChatId, currentWorkdir)
        transcript.log('new_chat')
        console.log(theme.system(t('msg.new_chat_ok') + String.fromCharCode(10)))
      } catch (e) {
        console.error(
          theme.error(t('msg.new_chat_error', { v: (e as Error).message })),
          (e as Error).message,
        )
      }
      continue
    }

    // ---------- Self-review ----------

    if (lower === '/self-review' || lower.startsWith('/self-review ')) {
      const focus = trimmed.slice('/self-review'.length).trim()

      // Remember where to return
      const originalWorkdir: string = reviewMode
        ? reviewMode.originalWorkdir
        : currentWorkdir

      try {
        const result = await mod.selfReview({
          browser,
          config,
          focus: focus || undefined,
          transcript,
        })

        // Switch to review mode:
        //  - working directory = snapshot
        //  - we do NOT reset the chat — inside selfReview a fresh chat was
        //    already created and the review prompt sent, we continue in it
        reviewMode = {
          snapDir: result.snapDir,
          snapName: path.basename(result.snapDir),
          originalWorkdir,
        }
        currentWorkdir = result.snapDir
        freshChatNext = false
        sendSystemPromptNext = false
        currentChatId = await browser.getCurrentChatId()
        saveLastChat(currentChatId, currentWorkdir)

        console.log(
          theme.user(
            t('self.review_hint', { name: reviewMode.snapName }),
          ),
        )
      } catch (e) {
        console.error(
          theme.error(t('self.review_failed')),
          (e as Error).message,
        )
        if (debug) console.error((e as Error).stack)
      }
      continue
    }

    if (lower === '/self-fix' || lower.startsWith('/self-fix ')) {
      const rest = trimmed.slice('/self-fix'.length).trim()
      if (!rest) {
        console.error(theme.error(t('self.fix_usage')))
        continue
      }
      const sp = rest.indexOf(' ')
      const name = sp === -1 ? rest : rest.slice(0, sp)
      const focus = sp === -1 ? '' : rest.slice(sp + 1).trim()

      const snapRoot = path.join(ZAMES_HOME, 'snapshots', name)
      const stat = await fs.stat(snapRoot).catch(() => null)
      if (!stat || !stat.isDirectory()) {
        console.error(theme.error(t('self.snapshot_not_found', { v: snapRoot })))
        continue
      }

      const originalWorkdir: string = reviewMode
        ? reviewMode.originalWorkdir
        : currentWorkdir

      // Fresh chat + review prompt for this snapshot
      try {
        const { runAgentLoop: ral } = await import('./agent-loop.js')
        const tools = mod.createTools(snapRoot, { undo: null })

        await browser.newChat()
        const sysPrompt = mod.buildSystemPrompt({
          workdir: snapRoot,
          tools,
          locale: currentLocale,
        })
        console.log(theme.system(t('self.init_review_chat')))
        await browser.ask(sysPrompt, { timeout: 60_000 })

        if (focus) {
          const ui = mod.createSpinner(currentLocale)
          ui.thinking()
          await ral({
            browser,
            tools,
            task: focus,
            workdir: snapRoot,
            maxIterations: maxIter,
            freshChat: false,
            sendSystemPrompt: false,
            transcript,
            onThinking: () => ui.thinking(),
            onToolCall: (name, toolArgs) => ui.toolCall(name, toolArgs),
            onToolResult: (r) => ui.toolResult(r),
            onAssistantMessage: (m) => {
              ui.assistant(m)
            },
            onWarning: (m) => ui.warning(m),
            locale: currentLocale,
          })
        }

        reviewMode = {
          snapDir: snapRoot,
          snapName: name,
          originalWorkdir,
        }
        currentWorkdir = snapRoot
        freshChatNext = false
        sendSystemPromptNext = false
        currentChatId = await browser.getCurrentChatId()
        saveLastChat(currentChatId, currentWorkdir)

        console.log(
          theme.user(
t('self.fix_hint', { name }),
          ),
        )
      } catch (e) {
        console.error(
          theme.error(t('self.enter_failed')),
          (e as Error).message,
        )
      }
      continue
    }

    if (lower === '/self-done') {
      if (!reviewMode) {
        console.log(theme.system(t('self.not_in_review')))
        continue
      }
      const back = reviewMode.originalWorkdir
      reviewMode = null
      currentWorkdir = back
      // Since the chat is busy with the review context, we'll create a new one for regular work
      freshChatNext = true
      sendSystemPromptNext = true
      console.log(
        theme.system(
t('self.done_hint', { v: back }),
        ),
      )
      continue
    }

    if (lower === '/self-list') {
      try {
        await mod.selfList({ config })
      } catch (e) {
        console.error(theme.error('Ошибка:'), (e as Error).message)
      }
      continue
    }

    if (lower === '/self-diff' || lower.startsWith('/self-diff ')) {
      const name = trimmed.slice('/self-diff'.length).trim()
      if (!name) {
        console.error(theme.error(t('self.diff_usage')))
        continue
      }
      try {
        await mod.selfDiff({ config, name })
      } catch (e) {
        console.error(theme.error('Ошибка:'), (e as Error).message)
      }
      continue
    }

    if (lower === '/self-apply' || lower.startsWith('/self-apply ')) {
      const name = trimmed.slice('/self-apply'.length).trim()
      if (!name) {
        console.error(theme.error(t('self.apply_usage')))
        continue
      }
      try {
        await mod.selfApply({ config, name })
      } catch (e) {
        console.error(theme.error('Ошибка:'), (e as Error).message)
      }
      continue
    }

    // ---------- Regular commands ----------

    if (lower === '/chats') {
      const spin = editor || mod.createSpinner(currentLocale)
      spin.thinking()
      try {
        lastChats = await browser.listChats(30)
        spin.stop()
        if (!lastChats.length) {
          console.log(
            theme.system(
              'Чатов не найдено. Возможно, сайдбар свёрнут или селекторы устарели.',
            ),
          )
        } else {
          console.log(theme.system(t('chats.recent')))
          lastChats.forEach((c, i) => {
            const n = String(i + 1).padStart(2, ' ')
            console.log(
              `  ${theme.user(n)}. ${c.title}  ${theme.system('(' + c.id.slice(0, 8) + '…)')}`,
            )
          })
          console.log(
            theme.system(t('chats.use_resume')),
          )
        }
      } catch (e) {
        spin.stop()
        console.error(
          theme.error(t('chats.fetch_error')),
          (e as Error).message,
        )
      }
      continue
    }

    if (lower === '/resume' || lower.startsWith('/resume ')) {
      const arg = trimmed.slice(7).trim()
      if (!arg) {
        console.error(
          theme.error(t('chats.resume_usage')),
        )
        continue
      }
      const n = Number(arg)
      if (!Number.isFinite(n) || n < 1) {
        console.error(theme.error(t('chats.need_number')))
        continue
      }
      if (!lastChats.length) {
        console.error(theme.error(t('chats.run_chats_first')))
        continue
      }
      const pick = lastChats[n - 1]
      if (!pick) {
        console.error(
          theme.error(t('chats.no_n', { n, total: lastChats.length })),
        )
        continue
      }

      console.log(theme.system(t('chats.opening', { v: pick.title })))
      try {
        await browser.openChat(pick.id)
        currentChatId = pick.id
        freshChatNext = false
        sendSystemPromptNext = resendPrompt
        saveLastChat(pick.id, currentWorkdir, pick.title)
        transcript.log('resume_chat', { id: pick.id, title: pick.title })
        console.log(
          theme.assistant(t('msg.chat_opened')) +
            theme.system(
              resendPrompt
                ? ' Системный промпт будет переслан на следующей задаче.\n'
                : ' Контекст чата сохранён. Системный промпт не пересылается (--resend-prompt чтобы дослать).\n',
            ),
        )
      } catch (e) {
        console.error(
          theme.error(t('msg.open_chat_error', { v: '' })),
          (e as Error).message,
        )
      }
      continue
    }

    if (lower === '/chat') {
      if (currentChatId) {
        console.log(theme.system(t('chats.current_id', { v: currentChatId })))
        console.log(
          theme.system(
            `URL: https://chat.deepseek.com/a/chat/s/${currentChatId}`,
          ),
        )
      } else {
        const id = await browser.getCurrentChatId()
        console.log(
          theme.system(id ? t('chats.current_id', { v: id }) : t('chats.not_created')),
        )
      }
      continue
    }

    if (lower === '/sessions' || lower === '/session') {
      const all = listSessions()
      console.log(theme.system(t('sessions.dir', { v: sessionsDir() })))
      if (!all.length) {
        console.log(
          theme.system(
            t('sessions.none'),
          ),
        )
      } else {
        all.forEach((s, i) => {
          const n = String(i + 1).padStart(2, ' ')
          const mark = s.id === currentChatId ? theme.user(' *') : ''
          const title = s.title ? `  ${s.title}` : ''
          const wd = s.workdir ? theme.dim(`  [${dirLabel(s.workdir)}]`) : ''
          console.log(
            `  ${theme.user(n)}. ${s.id.slice(0, 8)}…${title}${wd}${mark}`,
          )
        })
        console.log(
          theme.system(
            t('sessions.restore_hint'),
          ),
        )
      }
      continue
    }

    if (lower.startsWith('/resume-id ')) {
      const id = trimmed.slice('/resume-id'.length).trim()
      if (!id) {
        console.error(theme.error(t('sessions.resume_id_usage')))
        continue
      }
      try {
        console.log(theme.system(t('msg.opening_chat', { id })))
        await browser.openChat(id)
        currentChatId = id
        freshChatNext = false
        sendSystemPromptNext = resendPrompt
        saveLastChat(id, currentWorkdir)
        transcript.log('resume_chat', { id })
        console.log(
          theme.assistant('Чат открыт.') +
            theme.system(String.fromCharCode(10)),
        )
      } catch (e) {
        console.error(
          theme.error(t('msg.open_chat_error', { v: '' })),
          (e as Error).message,
        )
      }
      continue
    }

    if (lower === '/pwd') {
      console.log(theme.system(currentWorkdir))
      continue
    }

    if (lower === '/reload') {
      console.log(theme.system(t('msg.reload_start')))
      try {
        const { count, errors } = await reloadModules()
        if (errors.length) {
          console.error(theme.error(t('msg.reload_partial')))
          for (const e of errors) console.error(theme.error('  ' + e))
        } else {
          console.log(
            theme.assistant(
              `Перезагружено модулей: ${count}. Браузер и чат не тронуты.`,
            ),
          )
        }
      } catch (e) {
        console.error(theme.error(t('msg.reload_error')), (e as Error).message)
      }
      continue
    }

    if (lower === '/status') {
      const yes = t('common.yes')
      const no = t('common.no')
      console.log(theme.system(t('status.workdir', { v: currentWorkdir })))
      console.log(
        theme.system(
          t('status.review_mode', {
            v: reviewMode ? reviewMode.snapName : t('status.review_none'),
          }),
        ),
      )
      if (reviewMode) {
        console.log(
          theme.system(
            t('status.orig_dir', { v: reviewMode.originalWorkdir }),
          ),
        )
      }
      console.log(
        theme.system(
          t('status.chat', { v: currentChatId || t('common.none') }),
        ),
      )
      console.log(
        theme.system(t('status.fresh_next', { v: freshChatNext ? yes : no })),
      )
      console.log(
        theme.system(
          t('status.prompt_next', { v: sendSystemPromptNext ? yes : no }),
        ),
      )
      console.log(
        theme.system(t('status.resend', { v: resendPrompt ? yes : no })),
      )
      console.log(
        theme.system(
          t('status.last_chat', {
            v: loadLastChat(currentWorkdir) || t('common.none'),
          }),
        ),
      )
      console.log(theme.system(t('status.sessions', { v: sessionsDir() })))
      console.log(
        theme.system(
          t('status.dev', {
            v: devMode ? t('common.on') : t('common.off'),
          }),
        ),
      )
      console.log(theme.system(t('status.max_iter', { v: maxIter })))
      console.log(theme.system(t('status.headless', { v: headless ? yes : no })))
      console.log(theme.system(t('status.debug', { v: debug ? yes : no })))
      console.log(
        theme.system(
          t('status.undo', {
            v: config.undo.enabled ? t('common.on') : t('common.off'),
          }),
        ),
      )
      console.log(
        theme.system(
          t('status.transcript', {
            v: transcript.file || t('common.off'),
          }),
        ),
      )
      console.log(
        theme.system(
          t('status.locale', { v: localeDisplayName(currentLocale) }),
        ),
      )
      continue
    }

    if (lower === '/config' || lower.startsWith('/config ')) {
      await handleConfigCommand(trimmed)
      continue
    }

    if (lower === '/transcript') {
      console.log(theme.system(transcript.file || t('common.off')))
      continue
    }

    if (lower === '/undo') {
      const result = await undo.undoLast()
      if (result.ok && result.record) {
        console.log(
          theme.assistant(t('undo.reverted', { v: result.record.originalPath })) +
            theme.system(
              result.record.existed ? t('undo.restored') : t('undo.deleted'),
            ),
        )
        transcript.log('undo', { path: result.record.originalPath })
      } else {
        console.error(
          theme.error(t('undo.failed', { v: String(result.reason ?? '') })),
        )
      }
      continue
    }

    if (lower === '/undo-list' || lower === '/history') {
      const list = await undo.list(10)
      if (!list.length) {
        console.log(theme.system(t('undo.empty')))
      } else {
        for (const r of list) {
          const stamp = new Date(r.stamp).toLocaleString()
          const flag = r.existed ? t('undo.changed') : t('undo.created')
          console.log(theme.system(`${stamp}  [${flag}]  ${r.originalPath}`))
        }
      }
      continue
    }

    if (lower === '/debug-dom') {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const file = path.join(config.transcript.dir, `dom-${stamp}.html`)
      try {
        const result = await browser.dumpDom(file)
        console.log(theme.assistant(t('dom.saved', { v: result.file })))
        console.log(theme.system(t('dom.selectors')))
        console.log(JSON.stringify(result.selectors, null, 2))
      } catch (e) {
        console.error(
          theme.error(t('dom.save_error')),
          (e as Error).message,
        )
      }
      continue
    }

    if (lower === '/cd' || lower.startsWith('/cd ')) {
      const rawTarget = trimmed.slice(3).trim()
      try {
        const newDir = rawTarget
          ? path.resolve(currentWorkdir, rawTarget)
          : sandboxRoot
        const rel = path.relative(sandboxRoot, newDir)
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          console.error(theme.error(t('cd.outside', { v: sandboxRoot })))
          continue
        }
        const stat = await fs.stat(newDir).catch(() => null)
        if (!stat || !stat.isDirectory()) {
          console.error(theme.error(t('cd.not_dir', { v: newDir })))
          continue
        }
        if (newDir === currentWorkdir) {
          console.log(theme.system(t('cd.already')))
          continue
        }
        if (reviewMode) {
          console.log(theme.system(t('cd.left_review')))
          reviewMode = null
        }
        currentWorkdir = newDir
        freshChatNext = true
        sendSystemPromptNext = true
        console.log(theme.system(t('cd.changed', { v: newDir })))
      } catch (e) {
        console.error(
          theme.error(t('cd.failed', { v: (e as Error).message })),
        )
      }
      continue
    }

    if (lower.startsWith('/')) {
      console.error(
        theme.error(t('msg.unknown_cmd', { v: trimmed })),
      )
      continue
    }

    // ---- Regular task (including in review mode) ----

    // Dev mode: pick up fresh logic modules before the task.
    await autoReload()

    transcript.log('user_task', { task: trimmed, workdir: currentWorkdir })

    const tools = mod.createTools(currentWorkdir, { undo })
    if (editor) editor.busy = true
    try {
      await runTask(browser, tools, trimmed, currentWorkdir, {
        transcript,
        freshChat: freshChatNext,
        sendSystemPrompt: sendSystemPromptNext,
        queue: pendingQueue,
        ui: editor || null,
        onChatReady: (chatId) => {
          // Save the session right at the start of the dialog, without waiting
          // for the task to finish. Otherwise a long/aborted task would not
          // get the chat into ~/.zames/.sessions and it would be lost after a restart.
          if (chatId) {
            currentChatId = chatId
            saveLastChat(chatId, currentWorkdir)
          }
        },
      }, inputAttachments)
    } finally {
      if (editor) editor.busy = false
    }

    freshChatNext = false
    sendSystemPromptNext = false
    if (!currentChatId) {
      currentChatId = await browser.getCurrentChatId()
    }
    saveLastChat(currentChatId, currentWorkdir)
  }

  if (editor) editor.dispose()
  await browser.close().catch(() => {})
  await mod.closeWeb().catch(() => {})
  transcript.close()
}

main().catch((e) => {
  console.error(theme.error(t('msg.critical')), (e as Error).message)
  if (debug) console.error((e as Error).stack)
  process.exit(1)
})
