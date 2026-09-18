#!/usr/bin/env node
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import * as readlinePromises from 'readline/promises'
import { theme } from './theme.js'

import { DeepSeekBrowser } from './browser.js'
import { createTools } from './tools.js'
import { runAgentLoop } from './agent-loop.js'
import { createSpinner } from './spinner.js'
import { loadConfig, CONFIG_PATHS, ZAMES_HOME } from './config.js'
import { Transcript } from './transcript.js'
import { UndoStore } from './undo.js'
import { selfReview, selfDiff, selfApply, selfList } from './self-review.js'
import { closeWeb } from './web.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------- CLI parsing ----------

const args = process.argv.slice(2)

function getArg(flag, fallback = null) {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

function hasFlag(flag) {
  return args.includes(flag)
}

function getPositional() {
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
// --new-chat: намеренно начать с чистого чата, игнорируя сохранённый
// last-chat (полезно в watch-режиме, где по умолчанию чат восстанавливается).
const newChatFlag = hasFlag('--new-chat')

// ---------- last chat persistence ----------
// Запоминаем последний открытый chat id, чтобы после перезапуска процесса
// (в т.ч. автоперезапуска через `node --watch`) автоматически вернуться
// в ту же сессию, а не создавать новый чат.
const LAST_CHAT_FILE = path.join(ZAMES_HOME, 'last-chat.json')

async function saveLastChat(id) {
  if (!id) return
  try {
    await fs.mkdir(ZAMES_HOME, { recursive: true })
    await fs.writeFile(
      LAST_CHAT_FILE,
      JSON.stringify({ id, updatedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    )
  } catch (e) {
    if (debug) console.error('last-chat: не удалось сохранить:', e.message)
  }
}

async function loadLastChat() {
  try {
    const raw = await fs.readFile(LAST_CHAT_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return data && typeof data.id === 'string' ? data.id : null
  } catch {
    return null
  }
}


// ---------- hot reload ----------
// Держим ссылки на модули логики в объекте mod. Команда /reload перечитывает
// их через динамический import с timestamp-query — Node кэширует ESM по URL,
// поэтому такой import вернёт свежую версию модуля. Браузер, чат и текущее
// состояние НЕ перезапускаются: обновляется только логика.
const RELOADABLE = [
  './tools.js',
  './agent-loop.js',
  './system-prompt.js',
  './gitTools.js',
  './web.js',
  './self-review.js',
  './diff.js',
  './undo.js',
  './confirm.js',
  './transcript.js',
  './spinner.js',
  './config.js',
]

const mod = {
  createTools,
  runAgentLoop,
  buildSystemPrompt: null, // подгрузим ниже
  selfReview,
  selfDiff,
  selfApply,
  selfList,
  closeWeb,
  createSpinner,
}

async function reloadModules() {
  const stamp = Date.now()
  const loaded = new Map()
  const errors = []
  for (const rel of RELOADABLE) {
    try {
      const url = new URL(rel, import.meta.url)
      url.searchParams.set('t', String(stamp))
      const m = await import(url.href)
      loaded.set(rel, m)
    } catch (e) {
      errors.push(`${rel}: ${e.message}`)
    }
  }

  const pick = (rel, name) => loaded.get(rel)?.[name]

  if (pick('./tools.js', 'createTools')) mod.createTools = pick('./tools.js', 'createTools')
  if (pick('./agent-loop.js', 'runAgentLoop')) mod.runAgentLoop = pick('./agent-loop.js', 'runAgentLoop')
  if (pick('./system-prompt.js', 'buildSystemPrompt')) mod.buildSystemPrompt = pick('./system-prompt.js', 'buildSystemPrompt')
  if (pick('./self-review.js', 'selfReview')) mod.selfReview = pick('./self-review.js', 'selfReview')
  if (pick('./self-review.js', 'selfDiff')) mod.selfDiff = pick('./self-review.js', 'selfDiff')
  if (pick('./self-review.js', 'selfApply')) mod.selfApply = pick('./self-review.js', 'selfApply')
  if (pick('./self-review.js', 'selfList')) mod.selfList = pick('./self-review.js', 'selfList')
  if (pick('./web.js', 'closeWeb')) mod.closeWeb = pick('./web.js', 'closeWeb')
  if (pick('./spinner.js', 'createSpinner')) mod.createSpinner = pick('./spinner.js', 'createSpinner')

  return { count: loaded.size, errors }
}

// Первичная загрузка, чтобы mod.buildSystemPrompt и остальные были заполнены.
await reloadModules()

// Dev-режим: авто-перечитывание модулей логики перед каждой задачей.
// Включается флагом --dev (его ставит `npm run dev`) или config.hotReload === true.
// В обычном режиме (npm start, глобальный zames) авто-reload выключен.
const devMode = hasFlag('--dev') || config.hotReload === true

// Безопасный авто-reload: при ошибке загрузки оставляем прошлые рабочие модули.
async function autoReload() {
  if (!devMode) return
  const { errors } = await reloadModules()
  if (errors.length) {
    console.error(
      theme.warn('⚠ авто-reload: часть модулей не загрузилась, работаю на прежней версии:'),
    )
    for (const e of errors) console.error(theme.warn('  ' + e))
  }
}


// ---------- helpers ----------

function printHelp() {
  console.log(`
${theme.bold('zames')} — агент поверх chat.deepseek.com через Playwright

${theme.bold('Опции CLI:')}
  --dir <path>       рабочая директория агента
  --task <text>      задача одной строкой
  --chat <id>        продолжить существующий чат по id
  --new-chat         начать новый чат (игнорировать сохранённый)
  --resend-prompt    дослать system-prompt в существующий чат
  --max-iter <n>     лимит итераций (по умолчанию ${config.maxIterations})
  --headless         браузер без UI
  --debug            подробный лог
  --calibrate        режим калибровки селекторов
  --dev              режим разработки: авто-перечитывание модулей
  --version, -v      показать версию
  --help, -h         эта справка

${theme.bold('Обычные команды:')}
  /new, /clear             новый чат (сброс контекста)
  /chats                   список последних чатов DeepSeek
  /resume <n>              открыть чат №n из /chats
  /chat                    показать текущий chat id
  /cd <path>               сменить рабочую директорию
  /pwd                     текущая директория
  /status                  состояние сессии
  /reload                  перечитать модули логики без перезапуска
  /undo                    откатить последнюю запись/правку
  /undo-list               список того, что можно откатить
  /transcript              путь к файлу транскрипта
  /config                  показать текущий конфиг
  /debug-dom               сохранить HTML страницы (для отладки)
  /help, help              справка
  /exit, /quit, exit       выход

${theme.bold('Самообзор (отладка агента):')}
  /self-review [фокус]     снять снапшот src/ и запустить ревью
                            после этой команды ты остаёшься В СНАПШОТЕ
                            и можешь писать «исправь ошибки» и т.п.
  /self-fix <name> [фокус] вернуться в существующий снапшот и продолжить
  /self-done               выйти из режима ревью (вернуться в свою папку)
  /self-list               список снапшотов
  /self-diff <name>        различия между текущим src/ и снапшотом
  /self-apply <name>       применить снапшот к src/ (с бэкапом)

${theme.bold('Файлы:')}
  Логи:        ${config.transcript.dir}
  Undo:        ~/.zames/undo
  Профиль:     ~/.zames/profile
  Снапшоты:    ~/.zames/snapshots
  Конфиг:      ${CONFIG_PATHS.HOME_CONFIG}
               ${CONFIG_PATHS.PROJECT_CONFIG}
`)
}

function dirLabel(p) {
  return path.basename(p) || p
}

async function promptOnce(question) {
  process.stdin.resume()
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    process.stdin.setRawMode(false)
  }
  const rl = readlinePromises.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

// ---------- workdir resolution ----------

// ---------- workdir resolution ----------

// Агент работает в директории, из которой его запустили (process.cwd()).
// Это корень sandbox: инструменты не могут выходить выше него.
async function resolveWorkdir() {
  const explicitDir = getArg('--dir', null)
  const dir = explicitDir ? path.resolve(explicitDir) : process.cwd()
  const stat = await fs.stat(dir).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error('Не директория: ' + dir)
  }
  return dir
}

// ---------- task runner ----------

async function runTask(browser, tools, taskText, workdir, opts) {
  const { transcript, freshChat, sendSystemPrompt } = opts

  const ui = mod.createSpinner()
  ui.taskHeader(taskText)
  ui.thinking()

  let finished = false

  try {
    await mod.runAgentLoop({
      browser,
      tools,
      task: taskText,
      workdir,
      maxIterations: maxIter,
      freshChat,
      sendSystemPrompt,
      transcript,
      onThinking: () => ui.thinking(),
      onToolCall: (name, toolArgs) => ui.toolCall(name, toolArgs),
      onToolResult: (result) => ui.toolResult(result),
      onAssistantMessage: (msg) => {
        ui.assistant(msg)
        finished = true
      },
    })
  } catch (e) {
    ui.stop()
    console.error(theme.error('\n✖ Ошибка агента:'), e.message)
    if (debug) console.error(e.stack)
    transcript?.log('agent_error', { error: e.message })
  } finally {
    if (!finished) ui.stop()
  }
}

// ---------- main ----------

async function main() {
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
    console.log(theme.warn('\n🔧 Режим калибровки селекторов\n'))
  }

  let currentWorkdir
  try {
    currentWorkdir = await resolveWorkdir()
  // Корень sandbox: агент не может выходить выше директории запуска.
  const sandboxRoot = currentWorkdir
  } catch (e) {
    console.error(
      theme.error('Не удалось определить рабочую директорию:'),
      e.message,
    )
    process.exit(1)
  }

  console.log(theme.system(`Рабочая директория: ${currentWorkdir}`))

  const transcript = new Transcript({
    dir: config.transcript.dir,
    enabled: config.transcript.enabled,
    sessionName: dirLabel(currentWorkdir),
  })
  if (transcript.file) {
    console.log(theme.system(`Транскрипт: ${transcript.file}`))
  }

  const undo = new UndoStore(config.undo)

  const browser = new DeepSeekBrowser({
    headless,
    debug,
    channel: config.browserChannel,
    ...config.browser,
  })

  const bootSpinner = mod.createSpinner()
  bootSpinner.thinking()

  try {
    await browser.launch()
    bootSpinner.stop()
    await browser.waitForLogin()
  } catch (e) {
    bootSpinner.stop()
    console.error(theme.error('Не удалось запустить браузер:'), e.message)
    if (debug) console.error(e.stack)
    await browser.close().catch(() => {})
    transcript.close()
    process.exit(1)
  }

  // Разовый режим
  if (task) {
    const tools = mod.createTools(currentWorkdir, { undo })

    let freshChat = true
    let sendSystemPrompt = true

    // Приоритет: явный --chat, иначе сохранённый last-chat (если не --new-chat).
    let resumeId = chatIdArg
    if (!resumeId && !newChatFlag) {
      resumeId = await loadLastChat()
      if (resumeId) console.log(theme.system(`Восстанавливаю чат ${resumeId}...`))
    }

    if (resumeId) {
      try {
        console.log(theme.system(`Открываю чат ${resumeId}...`))
        await browser.openChat(resumeId)
        freshChat = false
        sendSystemPrompt = resendPrompt
      } catch (e) {
        console.error(theme.error(`Не удалось открыть чат: ${e.message}`))
      }
    }

    await autoReload()

    await runTask(browser, tools, task, currentWorkdir, {
      transcript,
      freshChat,
      sendSystemPrompt,
    })
    await browser.close()
    await mod.closeWeb().catch(() => {})
    transcript.close()
    return
  }

  console.log(
    theme.system(
      'Интерактивный режим. Введите задачу. Команды — /help. Выход — /exit.\n',
    ),
  )

  let freshChatNext = true
  let sendSystemPromptNext = true
  let lastChats = []
  let currentChatId = null
  let running = true

  // ---------- review mode state ----------
  // null — обычный режим.
  // { snapDir, snapName, originalWorkdir } — мы внутри снапшота, чат уже
  // инициализирован review-промптом, юзер может просто писать «исправь...».
  let reviewMode = null

  process.on('SIGINT', async () => {
    running = false
    await browser.close().catch(() => {})
    // Закрываем ленивый headless-браузер из web.js, иначе он останется
    // висеть отдельным процессом после выхода агента.
    await mod.closeWeb().catch(() => {})
    transcript.close()
    console.log(theme.system('\nВыход.'))
    process.exit(0)
  })

  // Приоритет: явный --chat, иначе сохранённый last-chat (если не --new-chat).
  let resumeId = chatIdArg
  if (!resumeId && !newChatFlag) {
    resumeId = await loadLastChat()
  }

  if (resumeId) {
    try {
      console.log(theme.system(`Открываю чат ${resumeId}...`))
      await browser.openChat(resumeId)
      currentChatId = resumeId
      freshChatNext = false
      sendSystemPromptNext = resendPrompt
      await saveLastChat(resumeId)
      console.log(theme.system(`Чат открыт: ${resumeId}\n`))
    } catch (e) {
      console.error(theme.error(`Не удалось открыть чат: ${e.message}`))
    }
  }

  while (running) {
    let input
    try {
      let label
      if (reviewMode) {
        label = `zames[REVIEW:${reviewMode.snapName}]> `
      } else if (currentChatId) {
        label = `zames[${dirLabel(currentWorkdir)}|${currentChatId.slice(0, 6)}]> `
      } else {
        label = `zames[${dirLabel(currentWorkdir)}]> `
      }
      input = await promptOnce(theme.user(label))
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
      console.log(theme.system('Создаю новый чат...'))
      try {
        await browser.newChat()
        freshChatNext = false
        sendSystemPromptNext = true
        currentChatId = await browser.getCurrentChatId()
        await saveLastChat(currentChatId)
        transcript.log('new_chat')
        console.log(theme.system('Новый чат.\n'))
      } catch (e) {
        console.error(theme.error('Не удалось создать новый чат:'), e.message)
      }
      continue
    }

    // ---------- Самообзор ----------

    if (lower === '/self-review' || lower.startsWith('/self-review ')) {
      const focus = trimmed.slice('/self-review'.length).trim()

      // Запоминаем, куда вернуться
      const originalWorkdir = reviewMode
        ? reviewMode.originalWorkdir
        : currentWorkdir

      try {
        const result = await mod.selfReview({
          browser,
          config,
          focus: focus || null,
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
        await saveLastChat(currentChatId)

        console.log(
          theme.user(
            '\n💡 Теперь ты в режиме ревью. Просто пиши агенту, например:\n' +
              '   «исправь ошибки»\n' +
              '   «доработай обработку ошибок в ask()»\n' +
              '   «покажи, что не так с undo»\n' +
              'Выйти: /self-done.  Применить: /self-apply ' +
              reviewMode.snapName +
              '\n',
          ),
        )
      } catch (e) {
        console.error(theme.error('Самообзор провалился:'), e.message)
        if (debug) console.error(e.stack)
      }
      continue
    }

    if (lower === '/self-fix' || lower.startsWith('/self-fix ')) {
      const rest = trimmed.slice('/self-fix'.length).trim()
      if (!rest) {
        console.error(theme.error('Использование: /self-fix <name> [фокус]'))
        continue
      }
      const sp = rest.indexOf(' ')
      const name = sp === -1 ? rest : rest.slice(0, sp)
      const focus = sp === -1 ? '' : rest.slice(sp + 1).trim()

      const snapRoot = path.join(ZAMES_HOME, 'snapshots', name)
      const stat = await fs.stat(snapRoot).catch(() => null)
      if (!stat || !stat.isDirectory()) {
        console.error(theme.error(`Снапшот не найден: ${snapRoot}`))
        continue
      }

      const originalWorkdir = reviewMode
        ? reviewMode.originalWorkdir
        : currentWorkdir

      // Свежий чат + review-промпт на этот снапшот
      try {
        const { runAgentLoop: ral } = await import('./agent-loop.js')
        const { buildSystemPrompt } = await import('./system-prompt.js')
        const tools = mod.createTools(snapRoot, { undo: null })

        await browser.newChat()
        const sysPrompt = mod.buildSystemPrompt({
          workdir: snapRoot,
          tools,
        })
        console.log(theme.system('Инициализирую review-чат для снапшота...'))
        await browser.ask(sysPrompt, { timeout: 60_000 })

        if (focus) {
          const ui = mod.createSpinner()
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
            onAssistantThought: (text) => {
              ui.stop()
              console.log(theme.system('\n💭 ' + text.slice(0, 1200) + '\n'))
            },
            onToolCall: (name, toolArgs) => ui.toolCall(name, toolArgs),
            onToolResult: (r) => ui.toolResult(r),
            onAssistantMessage: (m) => {
              ui.assistant(m)
            },
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
        await saveLastChat(currentChatId)

        console.log(
          theme.user(
            `\n💡 Режим ревью по снапшоту ${name}. Пиши агенту задачу или /self-done.\n`,
          ),
        )
      } catch (e) {
        console.error(theme.error('Не удалось войти в снапшот:'), e.message)
      }
      continue
    }

    if (lower === '/self-done') {
      if (!reviewMode) {
        console.log(theme.system('Ты и так не в режиме ревью.'))
        continue
      }
      const back = reviewMode.originalWorkdir
      reviewMode = null
      currentWorkdir = back
      // Раз чат занят review-контекстом, для обычной работы создадим новый
      freshChatNext = true
      sendSystemPromptNext = true
      console.log(
        theme.system(`Вернулся в ${back}. Следующая задача начнёт новый чат.\n`),
      )
      continue
    }

    if (lower === '/self-list') {
      try {
        await mod.selfList({ config })
      } catch (e) {
        console.error(theme.error('Ошибка:'), e.message)
      }
      continue
    }

    if (lower === '/self-diff' || lower.startsWith('/self-diff ')) {
      const name = trimmed.slice('/self-diff'.length).trim()
      if (!name) {
        console.error(theme.error('Использование: /self-diff <name>'))
        continue
      }
      try {
        await mod.selfDiff({ config, name })
      } catch (e) {
        console.error(theme.error('Ошибка:'), e.message)
      }
      continue
    }

    if (lower === '/self-apply' || lower.startsWith('/self-apply ')) {
      const name = trimmed.slice('/self-apply'.length).trim()
      if (!name) {
        console.error(theme.error('Использование: /self-apply <name>'))
        continue
      }
      try {
        await mod.selfApply({ config, name })
      } catch (e) {
        console.error(theme.error('Ошибка:'), e.message)
      }
      continue
    }

    // ---------- Обычные команды ----------

    if (lower === '/chats') {
      const spin = mod.createSpinner()
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
          console.log(theme.system('Последние чаты DeepSeek:'))
          lastChats.forEach((c, i) => {
            const n = String(i + 1).padStart(2, ' ')
            console.log(
              `  ${theme.user(n)}. ${c.title}  ${theme.system('(' + c.id.slice(0, 8) + '…)')}`,
            )
          })
          console.log(theme.system('\nИспользуй /resume <n> для продолжения.\n'))
        }
      } catch (e) {
        spin.stop()
        console.error(theme.error('Не удалось получить список:'), e.message)
      }
      continue
    }

    if (lower === '/resume' || lower.startsWith('/resume ')) {
      const arg = trimmed.slice(7).trim()
      if (!arg) {
        console.error(
          theme.error('Использование: /resume <n>  (или /chats для списка)'),
        )
        continue
      }
      const n = Number(arg)
      if (!Number.isFinite(n) || n < 1) {
        console.error(theme.error('Нужен номер из /chats.'))
        continue
      }
      if (!lastChats.length) {
        console.error(theme.error('Сначала выполни /chats.'))
        continue
      }
      const pick = lastChats[n - 1]
      if (!pick) {
        console.error(theme.error(`Нет чата №${n}. Всего: ${lastChats.length}.`))
        continue
      }

      console.log(theme.system(`Открываю: ${pick.title}`))
      try {
        await browser.openChat(pick.id)
        currentChatId = pick.id
        freshChatNext = false
        sendSystemPromptNext = resendPrompt
        await saveLastChat(pick.id)
        transcript.log('resume_chat', { id: pick.id, title: pick.title })
        console.log(
          theme.assistant(`Чат открыт.`) +
            theme.system(
              resendPrompt ? ' Системный промпт будет переслан на следующей задаче.\n' : ' Контекст чата сохранён. Системный промпт не пересылается (--resend-prompt чтобы дослать).\n',
            ),
        )
      } catch (e) {
        console.error(theme.error('Не удалось открыть чат:'), e.message)
      }
      continue
    }

    if (lower === '/chat') {
      if (currentChatId) {
        console.log(theme.system(`Текущий chat id: ${currentChatId}`))
        console.log(
          theme.system(
            `URL: https://chat.deepseek.com/a/chat/s/${currentChatId}`,
          ),
        )
      } else {
        const id = await browser.getCurrentChatId()
        console.log(
          theme.system(id ? `Текущий chat id: ${id}` : 'Чат ещё не создан.'),
        )
      }
      continue
    }

    if (lower === '/pwd') {
      console.log(theme.system(currentWorkdir))
      continue
    }

    if (lower === '/reload') {
      console.log(theme.system('Перечитываю модули логики...'))
      try {
        const { count, errors } = await reloadModules()
        if (errors.length) {
          console.error(theme.error('Часть модулей не перезагрузилась:'))
          for (const e of errors) console.error(theme.error('  ' + e))
        } else {
          console.log(
            theme.assistant(
              `Перезагружено модулей: ${count}. Браузер и чат не тронуты.`,
            ),
          )
        }
      } catch (e) {
        console.error(theme.error('Ошибка reload:'), e.message)
      }
      continue
    }

    if (lower === '/status') {
      console.log(theme.system(`Рабочая директория: ${currentWorkdir}`))
      console.log(
        theme.system(`Режим ревью: ${reviewMode ? reviewMode.snapName : 'нет'}`),
      )
      if (reviewMode) {
        console.log(
          theme.system(`Исходная директория: ${reviewMode.originalWorkdir}`),
        )
      }
      console.log(theme.system(`Текущий чат: ${currentChatId || '(нет)'}`))
      console.log(
        theme.system(
          `Fresh chat на след. задаче: ${freshChatNext ? 'да' : 'нет'}`,
        ),
      )
      console.log(
        theme.system(
          `System prompt на след. задаче: ${sendSystemPromptNext ? 'да' : 'нет'}`,
        ),
      )
      console.log(
        theme.system(`Resend prompt (--resend-prompt): ${resendPrompt ? 'да' : 'нет'}`),
      )
      console.log(
        theme.system(`Last chat: ${(await loadLastChat()) || 'нет'}`),
      )
      console.log(
        theme.system(`Dev mode (auto-reload): ${devMode ? 'вкл' : 'выкл'}`),
      )
      console.log(theme.system(`Лимит итераций: ${maxIter}`))
      console.log(theme.system(`Headless: ${headless ? 'да' : 'нет'}`))
      console.log(theme.system(`Debug: ${debug ? 'да' : 'нет'}`))
      console.log(theme.system(`Undo: ${config.undo.enabled ? 'вкл' : 'выкл'}`))
      console.log(theme.system(`Транскрипт: ${transcript.file || 'выкл'}`))
      continue
    }

    if (lower === '/config') {
      console.log(JSON.stringify(config, null, 2))
      continue
    }

    if (lower === '/transcript') {
      console.log(theme.system(transcript.file || '(выключен)'))
      continue
    }

    if (lower === '/undo') {
      const result = await undo.undoLast()
      if (result.ok) {
        console.log(
          theme.assistant(`↶ Откатили: ${result.record.originalPath}`) +
            theme.system(
              result.record.existed ? ' (восстановлено)' : ' (удалено)',
            ),
        )
        transcript.log('undo', { path: result.record.originalPath })
      } else {
        console.error(theme.error(`Не удалось откатить: ${result.reason}`))
      }
      continue
    }

    if (lower === '/undo-list' || lower === '/history') {
      const list = await undo.list(10)
      if (!list.length) {
        console.log(theme.system('История пуста.'))
      } else {
        for (const r of list) {
          const stamp = new Date(r.stamp).toLocaleString()
          const flag = r.existed ? 'изменён' : 'создан'
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
        console.log(theme.assistant(`HTML сохранён: ${result.file}`))
        console.log(theme.system('Селекторы:'))
        console.log(JSON.stringify(result.selectors, null, 2))
      } catch (e) {
        console.error(theme.error('Не удалось сохранить DOM:'), e.message)
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
          console.error(theme.error('Нельзя выйти за пределы: ' + sandboxRoot))
          continue
        }
        const stat = await fs.stat(newDir).catch(() => null)
        if (!stat || !stat.isDirectory()) {
          console.error(theme.error('Не директория: ' + newDir))
          continue
        }
        if (newDir === currentWorkdir) {
          console.log(theme.system('Уже здесь.'))
          continue
        }
        if (reviewMode) {
          console.log(theme.system('Вышел из режима ревью (/cd).'))
          reviewMode = null
        }
        currentWorkdir = newDir
        freshChatNext = true
        sendSystemPromptNext = true
        console.log(theme.system('Рабочая директория: ' + newDir))
      } catch (e) {
        console.error(theme.error('Не удалось перейти: ' + e.message))
      }
      continue
    }

    if (lower.startsWith('/')) {
      console.error(theme.error(`Неизвестная команда: ${trimmed}. Набери /help.`))
      continue
    }

    // ---- Обычная задача (в том числе в review-режиме) ----

    // Dev-режим: подхватываем свежие модули логики перед задачей.
    await autoReload()

    transcript.log('user_task', { task: trimmed, workdir: currentWorkdir })

    const tools = mod.createTools(currentWorkdir, { undo })
    await runTask(browser, tools, trimmed, currentWorkdir, {
      transcript,
      freshChat: freshChatNext,
      sendSystemPrompt: sendSystemPromptNext,
    })

    freshChatNext = false
    sendSystemPromptNext = false
    if (!currentChatId) {
      currentChatId = await browser.getCurrentChatId()
    }
    await saveLastChat(currentChatId)
  }

  await browser.close().catch(() => {})
  await mod.closeWeb().catch(() => {})
  transcript.close()
}

main().catch((e) => {
  console.error(theme.error('Критическая ошибка:'), e.message)
  if (debug) console.error(e.stack)
  process.exit(1)
})
