#!/usr/bin/env node
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { theme } from './theme.js'

import { DeepSeekBrowser } from './browser.js'
import { createTools } from './tools.js'
import { runAgentLoop } from './agent-loop.js'
import { createSpinner } from './spinner.js'
import { LineEditor } from './input.js'
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

interface RunTaskOptions {
  transcript: Transcript
  freshChat: boolean
  sendSystemPrompt: boolean
  queue?: string[]
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

// Текущий язык интерфейса/агента. Меняется командой /config lang <ru|en>.
let currentLocale: Locale = isLocale(config.ui?.locale)
  ? config.ui.locale
  : 'ru'
// Перевод: читает currentLocale в момент вызова, поэтому смена языка
// действует сразу, без перезапуска (для уже напечатанных строк).
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
// При возобновлении существующего чата system-prompt по умолчанию НЕ
// переотправляется (он уже есть в начале чата). Флаг --resend-prompt
// заставляет дослать его заново — например, если промпт обновился.
const resendPrompt = hasFlag('--resend-prompt')
// По умолчанию при старте начинается НОВЫЙ чат (контекст не тянется).
// --resume-last: вернуться в последнюю сессию для рабочей директории.
// --new-chat: оставлен для совместимости — это и так поведение по умолчанию.
const newChatFlag = hasFlag('--new-chat')
const resumeLastFlag = hasFlag('--resume-last')

// ---------- session persistence ----------
// Сессии (чаты DeepSeek) храним в ~/.zames/.sessions, чтобы они переживали
// перезапуск и были доступны для явного восстановления (--resume-last,
// --chat <id>, /resume <n>). Автоматически при старте они НЕ поднимаются.
// Раньше здесь был один файл last-chat.json, который терялся при смене
// проекта и не давал списка сессий для восстановления.
function saveLastChat(id: string | null, workdir = '', title = ''): void {
  if (!id) return
  saveSession({ id, workdir, title })
}

function loadLastChat(workdir = ''): string | null {
  const s = loadLastSession(workdir)
  return s ? s.id : null
}

// ---------- hot reload ----------
// Держим ссылки на модули логики в объекте mod. Команда /reload перечитывает
// их через динамический import с timestamp-query — Node кэширует ESM по URL,
// поэтому такой import вернёт свежую версию модуля. Браузер, чат и текущее
// состояние НЕ перезапускаются: обновляется только логика.
// В dev-режиме tsx грузит .ts-исходники из src/, а в собранном dist — .js.
// Динамический import с query ?t= идёт мимо переписывания расширений tsx,
// поэтому расширение подбираем сами — по фактическому файлу текущего модуля.
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

// Первичная загрузка, чтобы mod.buildSystemPrompt и остальные были заполнены.
await reloadModules()

// Dev-режим: авто-перечитывание модулей логики перед каждой задачей.
// Включается флагом --dev (его ставит `npm run dev`) или config.hotReload === true.
// В обычном режиме (npm start, глобальный zames) авто-reload выключен.
const devMode = hasFlag('--dev') || config.hotReload === true

// Безопасный авто-reload: при ошибке загрузки оставляем прошлые рабочие модули.
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

// Список slash-команд для автодополнения при вводе «/» (Tab — дополнить).
// Описание локализуется по ключу help.cmd.* в момент отображения — см.
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

// Описания slash-команд на текущем языке (для подсказок LineEditor).
function buildSlashCommands(): Array<{ name: string; description: string }> {
  return SLASH_COMMANDS.map((c) => ({
    name: c.name,
    description: t(c.key),
  }))
}

// Временные файлы агента (одноразовые скрипты и т.п.) складываем в
// <проект>/tmp — эта папка в .gitignore и очищается при каждом запуске.
const TMP_DIR = path.join(__dirname, '..', 'tmp')

async function cleanTmpDir(): Promise<void> {
  try {
    await fs.rm(TMP_DIR, { recursive: true, force: true })
    await fs.mkdir(TMP_DIR, { recursive: true })
  } catch (e) {
    if (debug) console.error('tmp: не удалось очистить:', (e as Error).message)
  }
}

// Ввод строки в терминале с корректной обработкой вставки (Shift+Insert,
// Ctrl+Shift+V, правая кнопка мыши и т.п.).
//
// Зачем свой ридер вместо readline:
//   1) readline отправляет строку на ПЕРВОМ переводе строки. При вставке
//      многострочного текста это приводило к немедленной отправке и к тому,
//      что в чат уходила только первая строка. Здесь переводы строк внутри
//      вставки заменяются на пробелы, а отправка происходит только по
//      одиночному нажатию Enter.
//   2) Включаем bracketed paste mode (\x1b[?2004h): терминал оборачивает
//      вставленный текст в маркеры \x1b[200~ … \x1b[201~, поэтому мы точно
//      знаем, что это вставка, а не набор с клавиатуры, и Enter внутри неё
//      не считается отправкой.
async function promptOnce(question: string): Promise<string> {
  const stdin = process.stdin
  const stdout = process.stdout

  // Не-TTY (пайп, редирект): читаем всё до EOF одной строкой.
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

  // Bracketed paste включаем/выключаем парно.
  stdout.write('\x1b[?2004h')
  stdout.write(question)

  let line = ''
  let cursor = 0
  let inPaste = false
  const PASTE_START = '\x1b[200~'
  const PASTE_END = '\x1b[201~'

  const redraw = () => {
    // Возвращаемся в начало строки, стираем и печатаем заново.
    stdout.write(String.fromCharCode(13))
    stdout.write('\x1b[K')
    stdout.write(question + line)
    // Ставим курсор в нужную позицию.
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
      // Нормализуем переводы строк: они приходят от многострочной вставки,
      // но означают «отправить». Внутри сообщения заменяем на пробел, чтобы
      // вся вставка ушла ОДНИМ сообщением.
      const clean = text
        .replace(/\r\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\n/g, ' ')
      line = line.slice(0, cursor) + clean + line.slice(cursor)
      cursor += clean.length
    }

    const onData = (buf: Buffer) => {
      let s = buf.toString('utf-8')

      // Fallback для терминалов без bracketed paste: если весь чанк — это
      // «голый» перевод строки (один байт), значит нажали Enter → отправляем.
      // Если переводы строк пришли ВМЕСТЕ с другим текстом в одном чанке —
      // это вставка; такие переводы строк не отправляют сообщение, а
      // заменяются на пробелы (см. insertText).
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
          // Всё до маркера обрабатываем как обычный ввод.
          const before = s.slice(0, start)
          s = s.slice(start + PASTE_START.length)
          inPaste = true
          if (before) {
            for (const ch of before) {
              if (ch === '\r' || ch === '\n') {
                /* внутри вставки — пропускаем */
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
          // Перевод строки внутри чанка с другим текстом (вставка без
          // bracketed paste): не отправляем, а вставляем пробел.
          insertText(' ')
          redraw()
          continue
        }
        if (code === 3) {
          // Ctrl+C — прерываем ввод.
          return finish('', true)
        }
        if (code === 4) {
          // Ctrl+D — как отправка пустой строки.
          return finish(line, true)
        }
        if (code === 21) {
          // Ctrl+U — стереть строку.
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
          // Escape-последовательности (стрелки, Home/End, Delete…).
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
          // Прочие ESC-последовательности пропускаем до буквы/тильды.
          const m = s.match(/^\[[0-9;]*[A-Za-z~]/)
          if (m) s = s.slice(m[0].length)
          continue
        }
        if (code < 32) continue // прочие управляющие символы игнорируем

        insertText(ch)
        redraw()
      }
    }

    stdin.on('data', onData)
  })
}

// Слежение за клавиатурой во время работы агента.
//
// Терминал остаётся живым, пока агент думает:
//   - Esc (или Ctrl+C) — прервать текущую генерацию (клик Stop в браузере);
//   - набор текста + Enter — поставить сообщение в очередь; оно уйдёт
//     агенту сразу после того, как текущая задача завершится
//     (как «отправить во время генерации» в веб-версии DeepSeek).
//
// Ввод буферизуется без построчного редактора: набранный текст отображается
// в строке спиннера через onChange -> ui.setPending(). Enter отправляет буфер
// в onQueue, пустой Enter игнорируется. Поддержаны Backspace, Ctrl+U, Esc-
// последовательности (стрелки/Home/End/Delete игнорируются) и bracketed paste.
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

  // Управляющие символы собираем из кодов: в этом файле нельзя писать
  // «сырые» ESC/CR/LF в строковых литералах (см. AGENTS.md).
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
  const PASTE_START = ESC + '[200~'
  const PASTE_END = ESC + '[201~'
  const CSI_RE = new RegExp('^' + CSI + '[0-9;]*[A-Za-z~]')

  const emitChange = (): void => {
    if (onChange) onChange(buf)
  }

  // Вставленный текст: переводы строк внутри многострочной вставки
  // трактуем как пробелы — сообщение уходит одной строкой.
  const insert = (text: string) => {
    buf += text
      .split(CR + LF)
      .join(' ')
      .split(CR)
      .join(' ')
      .split(LF)
      .join(' ')
  }

  function onData(data: Buffer) {
    let s = data.toString('utf-8')

    // Одиночный Esc — прервать генерацию. Стрелки приходят целым чанком
    // и сюда не попадают.
    if (!inPaste && s === ESC) {
      if (onEscape) onEscape()
      return
    }

    while (s.length) {
      if (inPaste) {
        const end = s.indexOf(PASTE_END)
        if (end === -1) {
          insert(s)
          s = ''
        } else {
          insert(s.slice(0, end))
          s = s.slice(end + PASTE_END.length)
          inPaste = false
        }
        emitChange()
        continue
      }

      const start = s.indexOf(PASTE_START)
      if (start !== -1) {
        const before = s.slice(0, start)
        s = s.slice(start + PASTE_START.length)
        inPaste = true
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
        const text = buf.trim()
        buf = ''
        emitChange()
        if (text && onQueue) onQueue(text)
        continue
      }
      if (code === 3) {
        // Ctrl+C — как Esc: прервать генерацию.
        if (onEscape) onEscape()
        continue
      }
      if (code === 21) {
        // Ctrl+U — очистить набранное.
        buf = ''
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
        // Escape-последовательность (стрелки, Home/End, Delete) — пропускаем.
        const m = s.match(CSI_RE)
        if (m) s = s.slice(m[0].length)
        continue
      }
      if (code < 32) continue // прочие управляющие — игнорируем

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

// Агент работает в директории, из которой его запустили (process.cwd()).
// Это корень sandbox: инструменты не могут выходить выше него.
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
): Promise<void> {
  const {
    transcript,
    freshChat,
    sendSystemPrompt,
    queue = [],
    ui: editor,
    onChatReady,
  } = opts

  // В TTY-режиме UI — это LineEditor: он владеет вводом (очередь, Esc,
  // Ctrl+C) и рисует статус НАД постоянной строкой ввода. В не-TTY режиме
  // (пайпы) — обычный спиннер + watchInput.
  // Новая задача с промпта — сбрасываем «стоп» от прошлого прерывания.
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
          queue.push(text)
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
    let next = { task: taskText, freshChat, sendSystemPrompt }

    // Выполняем задачу, затем — всё, что пользователь успел напечатать за
    // время работы. Очередь может пополняться прямо во время дренажа.
    while (true) {
      ui.thinking()
      await mod.runAgentLoop({
        browser,
        tools,
        task: next.task,
        workdir,
        maxIterations: maxIter,
        freshChat: next.freshChat,
        sendSystemPrompt: next.sendSystemPrompt,
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

      // Прервали (Esc/Ctrl+C) — не запускаем следующие задачи из очереди
      // и очищаем её, чтобы «стоп» действительно останавливал всё.
      if (browser._stopped) {
        queue.length = 0
        break
      }
      if (!queue.length) break

      const queued = queue.shift() ?? ''
      ui.stop()
      if (editor) {
        editor.printAbove(
          theme.user(t('msg.from_queue')) + theme.assistant(queued),
        )
      } else {
        console.log(theme.user(t('msg.from_queue')) + theme.assistant(queued))
      }
      transcript?.log('queued_task', { task: queued })
      next = { task: queued, freshChat: false, sendSystemPrompt: false }
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
    // Корень sandbox: агент не может выходить выше директории запуска.
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

  // Разовый режим
  if (task) {
    const tools = mod.createTools(currentWorkdir, { undo })

    let freshChat = true
    let sendSystemPrompt = true

    // По умолчанию начинаем новый чат. Продолжить прошлую сессию —
    // явно: --chat <id> или --resume-last.
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

  // Сообщения, набранные пользователем, пока агент работал. runTask
  // забирает их по одному после завершения текущей задачи.
  const pendingQueue: string[] = []

  // ---------- review mode state ----------
  // null — обычный режим.
  // { snapDir, snapName, originalWorkdir } — мы внутри снапшота, чат уже
  // инициализирован review-промптом, юзер может просто писать «исправь...».
  let reviewMode: ReviewMode | null = null

  process.on('SIGINT', async () => {
    running = false
    await browser.close().catch(() => {})
    // Закрываем ленивый headless-браузер из web.js, иначе он останется
    // висеть отдельным процессом после выхода агента.
    await mod.closeWeb().catch(() => {})
    transcript.close()
    console.log(theme.system(String.fromCharCode(10) + t('msg.bye')))
    process.exit(0)
  })

  // По умолчанию при старте начинаем НОВЫЙ чат: контекст прошлой сессии
  // не тянется автоматически. Продолжить прошлую сессию можно явно:
  //   --chat <id>     открыть конкретный чат
  //   --resume-last   вернуться в последний чат для этой рабочей директории
  //   --new-chat      оставлен для совместимости (это и так поведение по умолчанию)
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

  // ---------- ввод: постоянная строка внизу + статус сверху ----------
  // В TTY используем LineEditor: он владеет вводом всё время, показывает
  // статус над строкой ввода и печатает ответы агента ВЫШЕ неё, поэтому
  // набранный текст никогда не затирается выводом. В не-TTY (пайп) —
  // старый promptOnce.
  let editor: LineEditor | null = null
  let waiter: ((v: string | null) => void) | null = null
  const takeInput = (): Promise<string | null> => {
    if (pendingQueue.length)
      return Promise.resolve(pendingQueue.shift() ?? null)
    return new Promise<string | null>((resolve) => {
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
    ed.onSubmit = (text: string) => {
      pendingQueue.push(text)
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
        // Не заняты — выходим. Будим takeInput(), чтобы цикл завершился.
        running = false
        if (waiter) {
          const r = waiter
          waiter = null
          r(null)
        }
      }
    }
    ed.start()

    // Весь вывод команд (console.log/error) должен идти ВЫШЕ строки ввода,
    // иначе он затирает набираемый текст. Пока редактор активен, заворачиваем
    // оба потока в ed.printAbove.
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
    // Сохраняем на случай отладки.
    const edAny = ed as unknown as Record<string, unknown>
    edAny._origLog = origLog
    edAny._origErr = origErr
  }

  // ---------- /config ----------
  // Просмотр и правка настроек без перезапуска. Значения валидируются по
  // CONFIG_SCHEMA (src/config.ts) и пишутся в проектный .zamesrc.json.
  // Язык (ui.locale) применяется сразу: меняем currentLocale, пересобираем
  // подсказки редактора и обновляем config.ui.locale (его читает agent-loop
  // при следующей задаче).
  //
  // Без аргументов в интерактивном терминале открывается меню (стрелки,
  // Enter — изменить, d — сбросить, q — выйти). Есть и текстовые подкоманды
  // (list/get/set/reset/lang/path) — для скриптов и не-TTY.
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
    // Возвращаем рантайм-значение к дефолту.
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
    // Меню рисует напрямую в stdout и само читает клавиши. Чтобы его вывод
    // не накладывался на постоянную строку ввода LineEditor, на время меню
    // «ставим редактор на паузу», а после — возвращаем.
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

    // Без подкоманды — меню (или текстовый список в не-TTY).
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

    // /config lang <ru|en> — быстрый доступ к ui.locale
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

    // Неизвестная подкоманда — показываем список.
    console.error(theme.error(t('cfg.unknown_key', { v: sub })))
    configShowList()
  }

  while (running) {
    let input: string | null
    try {
      if (editor) {
        editor.setPrompt(buildPrompt())
        input = await takeInput()
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

    // ---------- Самообзор ----------

    if (lower === '/self-review' || lower.startsWith('/self-review ')) {
      const focus = trimmed.slice('/self-review'.length).trim()

      // Запоминаем, куда вернуться
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

        // Переходим в review-режим:
        //  - рабочая директория = снапшот
        //  - чат НЕ сбрасываем — внутри selfReview уже создан свежий чат
        //    и отправлен review-промпт, продолжим в нём
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

      // Свежий чат + review-промпт на этот снапшот
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
      // Раз чат занят review-контекстом, для обычной работы создадим новый
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

    // ---------- Обычные команды ----------

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

    // ---- Обычная задача (в том числе в review-режиме) ----

    // Dev-режим: подхватываем свежие модули логики перед задачей.
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
          // Сохраняем сессию сразу при начале диалога, не дожидаясь конца
          // задачи. Иначе при долгой/прерванной задаче чат не попадал в
          // ~/.zames/.sessions и терялся после перезапуска.
          if (chatId) {
            currentChatId = chatId
            saveLastChat(chatId, currentWorkdir)
          }
        },
      })
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
