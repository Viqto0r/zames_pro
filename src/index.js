#!/usr/bin/env node
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import readline from 'readline'
import { fileURLToPath } from 'url'
import chalk from 'chalk'

import { DeepSeekBrowser } from './browser.js'
import { createTools } from './tools.js'
import { runAgentLoop } from './agent-loop.js'
import { createSpinner } from './spinner.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------- paths ----------

const PROJECTS_ROOT = path.join(__dirname, '..', 'projects')

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
    if (
      a === '--dir' ||
      a === '--task' ||
      a === '--max-iter' ||
      a === '--project'
    ) {
      i++
      continue
    }
    if (a.startsWith('--')) continue
    positional.push(a)
  }
  return positional
}

const headless = hasFlag('--headless')
const debug = hasFlag('--debug')
const calibrate = hasFlag('--calibrate')
const maxIter = Number(getArg('--max-iter', '40')) || 40

const positional = getPositional()
const task = getArg('--task', positional.join(' ').trim() || null)
const projectName = getArg('--project', null)

// ---------- helpers ----------

function printHelp() {
  console.log(`
${chalk.bold('dsa')} — агент поверх chat.deepseek.com через Playwright

${chalk.bold('Использование:')}
  dsa [опции] [задача]

${chalk.bold('Опции:')}
  --dir <path>       рабочая директория агента
  --project <name>   проект в песочнице (${PROJECTS_ROOT}\\<name>)
  --task <text>      задача одной строкой
  --max-iter <n>     лимит итераций агентского цикла (по умолчанию 40)
  --headless         запустить браузер без UI
  --debug            подробный лог Playwright
  --calibrate        режим калибровки селекторов
  --help, -h         эта справка

${chalk.bold('Примеры:')}
  dsa                                  # интерактив, спросит директорию
  dsa --project my-app                 # работать в projects/my-app
  dsa --project my-app "напиши hello"  # разовая задача
  dsa --dir C:/work/proj "задача"      # конкретная директория

${chalk.bold('Команды в интерактивном режиме:')}
  /new, /clear             начать новый чат (сбросить контекст)
  /cd <path>               сменить рабочую директорию (создаст новый чат)
  /cd                      перейти в корень песочницы
  /project <name>          перейти в projects/<name>
  /pwd                     показать текущую директорию
  /status                  состояние сессии
  /help, help              эта справка
  /exit, /quit, exit       выйти
`)
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true })
}

function dirLabel(p) {
  const base = path.basename(p)
  return base || p
}

async function promptLine(question) {
  process.stdin.resume()
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    process.stdin.setRawMode(false)
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

// ---------- workdir resolution ----------

async function resolveWorkdir({ interactive }) {
  await ensureDir(PROJECTS_ROOT)

  if (projectName) {
    const p = path.join(PROJECTS_ROOT, projectName)
    await ensureDir(p)
    return p
  }

  const explicitDir = getArg('--dir', null)
  if (explicitDir) return path.resolve(explicitDir)

  if (process.env.DSA_DIR) return path.resolve(process.env.DSA_DIR)

  if (!interactive) return PROJECTS_ROOT

  console.log(chalk.gray(`Песочница проектов: ${PROJECTS_ROOT}`))
  const answer = await promptLine(
    chalk.cyan(
      `Рабочая директория [Enter — ${PROJECTS_ROOT}, либо путь / имя проекта]: `,
    ),
  )
  const trimmed = (answer || '').trim()
  if (!trimmed) return PROJECTS_ROOT

  if (
    !trimmed.includes('/') &&
    !trimmed.includes('\\') &&
    !path.isAbsolute(trimmed)
  ) {
    const p = path.join(PROJECTS_ROOT, trimmed)
    await ensureDir(p)
    return p
  }

  return path.resolve(trimmed)
}

// ---------- task runner ----------

async function runTask(browser, tools, taskText, workdir, initializeChat) {
  const ui = createSpinner()
  ui.taskHeader(taskText)
  ui.thinking()

  let finished = false

  try {
    await runAgentLoop({
      browser,
      tools,
      task: taskText,
      workdir,
      maxIterations: maxIter,
      initializeChat,
      onToolCall: (name, toolArgs) => ui.toolCall(name, toolArgs),
      onToolResult: (result) => ui.toolResult(result),
      onAssistantMessage: (msg) => {
        ui.assistant(msg)
        finished = true
      },
    })
  } catch (e) {
    ui.stop()
    console.error(chalk.red('\n✖ Ошибка агента:'), e.message)
    if (debug) console.error(e.stack)
    return
  } finally {
    if (!finished) ui.stop()
  }
}

// ---------- main ----------

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    printHelp()
    return
  }

  if (calibrate) {
    console.log(chalk.yellow('\n🔧 Режим калибровки селекторов'))
    console.log(
      'Открой DevTools (F12), найди селекторы поля ввода и контейнера ответа\n' +
        'и обнови INPUT_SELECTORS / ANSWER_SELECTORS в src/browser.js.\n',
    )
  }

  const interactive = !task
  let currentWorkdir
  try {
    currentWorkdir = await resolveWorkdir({ interactive })
  } catch (e) {
    console.error(
      chalk.red('Не удалось определить рабочую директорию:'),
      e.message,
    )
    process.exit(1)
  }

  console.log(chalk.gray(`Рабочая директория: ${currentWorkdir}`))

  const browser = new DeepSeekBrowser({ headless, debug })
  const bootSpinner = createSpinner()
  bootSpinner.thinking()

  try {
    await browser.launch()
    bootSpinner.stop()
    await browser.waitForLogin()
  } catch (e) {
    bootSpinner.stop()
    console.error(chalk.red('Не удалось запустить браузер:'), e.message)
    if (debug) console.error(e.stack)
    await browser.close().catch(() => {})
    process.exit(1)
  }

  // Флаг: отправлен ли системный промпт в текущий чат
  let chatInitialized = false

  // Одноразовый режим
  if (task) {
    const tools = createTools(currentWorkdir)
    await runTask(browser, tools, task, currentWorkdir, true)
    await browser.close()
    return
  }

  // Интерактивный режим
  console.log(
    chalk.gray(
      'Интерактивный режим. Введите задачу. Команды — /help. Выход — /exit.\n' +
        'Чат DeepSeek сохраняется между задачами. /new — начать заново.\n',
    ),
  )

  let running = true
  process.on('SIGINT', async () => {
    running = false
    await browser.close().catch(() => {})
    console.log(chalk.gray('\nВыход.'))
    process.exit(0)
  })

  while (running) {
    let input
    try {
      input = await promptLine(chalk.cyan(`dsa[${dirLabel(currentWorkdir)}]> `))
    } catch {
      break
    }

    const trimmed = (input || '').trim()
    if (!trimmed) continue

    const lower = trimmed.toLowerCase()

    // ---- Команды ----

    if (
      lower === '/exit' ||
      lower === '/quit' ||
      lower === 'exit' ||
      lower === 'quit'
    ) {
      break
    }

    if (lower === '/help' || lower === 'help') {
      printHelp()
      continue
    }

    if (lower === '/new' || lower === '/clear' || lower === 'new') {
      console.log(chalk.gray('Создаю новый чат...'))
      try {
        await browser.newChat()
        chatInitialized = false
        console.log(chalk.gray('Новый чат. Контекст сброшен.\n'))
      } catch (e) {
        console.error(chalk.red('Не удалось создать новый чат:'), e.message)
      }
      continue
    }

    if (lower === '/pwd') {
      console.log(chalk.gray(currentWorkdir))
      continue
    }

    if (lower === '/status') {
      console.log(chalk.gray(`Рабочая директория: ${currentWorkdir}`))
      console.log(
        chalk.gray(`Чат инициализирован: ${chatInitialized ? 'да' : 'нет'}`),
      )
      console.log(chalk.gray(`Лимит итераций: ${maxIter}`))
      console.log(chalk.gray(`Headless: ${headless ? 'да' : 'нет'}`))
      console.log(chalk.gray(`Debug: ${debug ? 'да' : 'нет'}`))
      continue
    }

    if (lower === '/cd' || lower.startsWith('/cd ')) {
      const rawTarget = trimmed.slice(3).trim()
      try {
        let newDir
        if (!rawTarget) {
          newDir = PROJECTS_ROOT
        } else if (
          !rawTarget.includes('/') &&
          !rawTarget.includes('\\') &&
          !path.isAbsolute(rawTarget)
        ) {
          newDir = path.join(PROJECTS_ROOT, rawTarget)
        } else {
          newDir = path.resolve(currentWorkdir, rawTarget)
        }

        await ensureDir(newDir)
        const stat = await fs.stat(newDir)
        if (!stat.isDirectory()) {
          console.error(chalk.red(`Не директория: ${newDir}`))
          continue
        }

        if (newDir === currentWorkdir) {
          console.log(chalk.gray('Уже здесь.\n'))
          continue
        }

        currentWorkdir = newDir
        chatInitialized = false // путь в системном промпте устарел
        console.log(
          chalk.gray(`Рабочая директория: ${currentWorkdir}`) +
            chalk.gray(' (контекст будет сброшен на следующей задаче)\n'),
        )
      } catch (e) {
        console.error(chalk.red(`Не удалось перейти: ${e.message}`))
      }
      continue
    }

    if (lower === '/project' || lower.startsWith('/project ')) {
      const name = trimmed.slice(8).trim()
      if (!name) {
        console.error(chalk.red('Использование: /project <name>'))
        continue
      }
      const newDir = path.join(PROJECTS_ROOT, name)
      try {
        await ensureDir(newDir)
        if (newDir !== currentWorkdir) {
          currentWorkdir = newDir
          chatInitialized = false
        }
        console.log(chalk.gray(`Рабочая директория: ${currentWorkdir}\n`))
      } catch (e) {
        console.error(chalk.red(`Не удалось создать проект: ${e.message}`))
      }
      continue
    }

    // Неизвестная команда (начинается со слэша)
    if (lower.startsWith('/')) {
      console.error(chalk.red(`Неизвестная команда: ${trimmed}. Набери /help.`))
      continue
    }

    // ---- Обычная задача ----

    const tools = createTools(currentWorkdir)
    await runTask(
      browser,
      tools,
      trimmed,
      currentWorkdir,
      /* initializeChat */ !chatInitialized,
    )
    chatInitialized = true // после первой задачи чат точно инициализирован
  }

  await browser.close().catch(() => {})
}

main().catch((e) => {
  console.error(chalk.red('Критическая ошибка:'), e.message)
  if (debug) console.error(e.stack)
  process.exit(1)
})
