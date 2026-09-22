// Интерактивное меню настроек для команды /config.
//
// Меню рисует список параметров, сгруппированных по секциям, и позволяет
// менять их стрелками: boolean/enum переключаются на месте, number/string
// запрашивают ввод. Все строки берутся из i18n (cfg.*), поэтому меню
// полностью локализовано.
//
// Модуль не знает про config.ts напрямую (кроме типов схемы): чтение и
// запись значений делает вызывающий через колбэки. Так меню легко тестировать
// и переиспользовать.

import { theme } from './theme.js'
import type { TranslateFn } from './i18n.js'
import type { ConfigField } from './config.js'

export interface ConfigMenuOptions {
  fields: ConfigField[]
  t: TranslateFn
  /** Текущее значение поля (может быть undefined = дефолт). */
  get: (path: string) => unknown
  /** Сохранить новое значение. Бросает при ошибке валидации. */
  set: (field: ConfigField, raw: string) => void
  /** Сбросить к дефолту. */
  reset: (field: ConfigField) => void
  /** Ввод/вывод; по умолчанию process.stdin/stdout. */
  input?: NodeJS.ReadStream
  output?: NodeJS.WriteStream
}

const ESC = String.fromCharCode(27)

// Убираем ANSI-последовательности, чтобы посчитать видимую длину строки.
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
}

function displayValue(
  field: ConfigField,
  value: unknown,
  t: TranslateFn,
): string {
  if (value === undefined) return t('cfg.menu.default')
  if (typeof value === 'boolean') return value ? t('common.on') : t('common.off')
  return String(value)
}

function groupLabel(field: ConfigField, t: TranslateFn): string {
  return t(field.groupKey)
}

/**
 * Показать интерактивное меню. Возвращает промис, который резолвится, когда
 * пользователь вышел (q/Esc/Ctrl+C). В не-TTY бросает ошибку — вызывающий
 * должен показать текстовый список.
 */
export function runConfigMenu(opts: ConfigMenuOptions): Promise<void> {
  const input = opts.input || process.stdin
  const output = opts.output || process.stdout
  const { fields, t, get, set, reset } = opts

  if (!input.isTTY || !input.setRawMode) {
    return Promise.reject(new Error(t('cfg.menu.notty')))
  }

  let cursor = 0
  let editing = false
  let editBuf = ''
  let message: string | null = null
  let exited = false
  let resolveDone: (() => void) | null = null

  const wasRaw = input.isRaw
  input.setRawMode(true)
  input.resume()
  output.write(ESC + '[?25l') // прячем курсор на время отрисовки

  // Отрисовка меню: строки идут сверху вниз, курсор возвращаем в начало
  // блока через относительные перемещения, чтобы не плодить пустые строки.
  let lastRows = 0
  const render = (): void => {
    const lines: string[] = []
    lines.push(theme.bold(t('cfg.menu.title')))
    let lastGroup = ''
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]
      const g = groupLabel(f, t)
      if (g !== lastGroup) {
        lines.push(theme.system('  ' + g))
        lastGroup = g
      }
      const selected = i === cursor
      const marker = selected ? theme.prompt('\u276f ') : '  '
      const label = selected ? theme.prompt(f.labelKey ? t(f.labelKey) : f.path) : t(f.labelKey || f.path)
      const val = displayValue(f, get(f.path), t)
      const valText = selected ? theme.assistant(val) : theme.dim(val)
      const pathText = selected ? theme.dim('  ' + f.path) : ''
      lines.push(marker + label + theme.dim('  =  ') + valText + pathText)
    }
    if (editing) {
      lines.push('')
      lines.push(theme.user(t('cfg.menu.edit_hint')))
      lines.push(theme.prompt('\u276f ') + editBuf)
    } else if (message) {
      lines.push('')
      lines.push(theme.assistant(message))
    } else {
      lines.push('')
      lines.push(theme.dim(t('cfg.menu.hint')))
    }

    // Стираем прошлый блок и печатаем новый. Считаем ВИЗУАЛЬНЫЕ строки
    // (с учётом переноса по ширине терминала), иначе на узких терминалах
    // остаётся «мусор» из нестёртых хвостов.
    const cols = output.columns || 80
    const rowsOf = (s: string): number => {
      const len = stripAnsi(s).length
      return Math.max(1, Math.ceil(len / Math.max(1, cols)))
    }
    if (lastRows > 0) {
      output.write(ESC + '[' + lastRows + 'A')
      for (let i = 0; i < lastRows; i++) {
        output.write(ESC + '[2K' + ESC + '[1B')
      }
      output.write(ESC + '[' + lastRows + 'A')
    }
    output.write(lines.join('\n') + '\n')
    lastRows = lines.reduce((n, l) => n + rowsOf(l), 0)
  }

  const cleanup = (): void => {
    if (exited) return
    exited = true
    input.removeListener('data', onData)
    if (input.setRawMode) input.setRawMode(wasRaw || false)
    output.write(ESC + '[?25h') // возвращаем курсор
    if (resolveDone) resolveDone()
  }

  const commitEdit = (): void => {
    const f = fields[cursor]
    const raw = editBuf.trim()
    editing = false
    editBuf = ''
    if (!raw) {
      message = null
      return
    }
    try {
      set(f, raw)
      message = t('cfg.menu.saved', {
        v: f.path,
        value: displayValue(f, get(f.path), t),
      })
    } catch (e) {
      message = String((e as Error).message || e)
    }
  }

  const toggle = (): void => {
    const f = fields[cursor]
    if (f.type === 'boolean') {
      const cur = get(f.path)
      set(f, cur === true ? 'false' : 'true')
      message = null
      return
    }
    if (f.type === 'enum' && f.values && f.values.length) {
      const cur = String(get(f.path) ?? '')
      const idx = f.values.indexOf(cur)
      const next = f.values[(idx + 1) % f.values.length]
      set(f, next)
      message = null
      return
    }
    // number/string — запрашиваем ввод.
    editing = true
    editBuf = get(f.path) === undefined ? '' : String(get(f.path))
  }

  const onData = (buf: Buffer): void => {
    const s = buf.toString('utf-8')
    if (editing) {
      // Обрабатываем ввод посимвольно: терминал может прислать несколько
      // байт сразу (вставка, авто-повтор), Enter — 0x0d/0x0a, backspace — 0x7f.
      for (const ch of s) {
        if (ch === '\r' || ch === '\n') {
          commitEdit()
          break
        }
        if (ch === ESC) {
          editing = false
          editBuf = ''
          break
        }
        if (ch === '\x03') {
          cleanup()
          output.write('\n')
          return
        }
        if (ch === '\x7f' || ch === '\b') {
          editBuf = editBuf.slice(0, -1)
        } else if (ch >= ' ') {
          editBuf += ch
        }
      }
      render()
      return
    }

    // Терминал может прислать несколько клавиш одним пакетом (быстрый набор,
    // авто-повтор, автоматизация). Разбираем буфер по токенам: сначала
    // escape-последовательности (стрелки), затем одиночные символы.
    let i = 0
    while (i < s.length) {
      if (s.startsWith('\x1b[A', i)) {
        cursor = (cursor - 1 + fields.length) % fields.length
        message = null
        i += 3
        continue
      }
      if (s.startsWith('\x1b[B', i)) {
        cursor = (cursor + 1) % fields.length
        message = null
        i += 3
        continue
      }
      const ch = s[i]
      if (ch === 'q' || ch === 'Q' || ch === '\x03' || ch === ESC) {
        cleanup()
        output.write('\n')
        return
      }
      if (ch === 'k') {
        cursor = (cursor - 1 + fields.length) % fields.length
        message = null
      } else if (ch === 'j') {
        cursor = (cursor + 1) % fields.length
        message = null
      } else if (ch === '\r' || ch === '\n' || ch === ' ') {
        toggle()
      } else if (ch === 'd' || ch === 'D') {
        const f = fields[cursor]
        reset(f)
        message = t('cfg.reset', { v: f.path })
      }
      i++
    }
    render()
  }

  return new Promise<void>((resolve) => {
    resolveDone = resolve
    input.on('data', onData)
    render()
  })
}
