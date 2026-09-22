import { theme } from './theme.js'
import { renderMarkdown } from './markdown.js'
import { randomThinkingPhrase, stripEllipsis } from './spinner.js'

// Постоянная строка ввода внизу терминала + область статуса/вывода над ней.
//
// Зачем свой редактор:
//   * строка ввода видна ВСЕГДА и не затирается выводом агента;
//   * спиннер/статус и ответы печатаются ВЫШЕ строки ввода (printAbove);
//   * перерисовка учитывает перенос по ширине терминала, поэтому нет
//     дублирования строк при многострочном вводе;
//   * многострочный ввод: Enter отправляет, но если курсор стоит сразу
//     после «\», Enter удаляет «\» и переносит строку (как в Claude Code).
//     Ctrl+J, Ctrl+Enter и Shift+Enter (в терминалах с расширенным
//     протоколом) всегда вставляют перевод строки;
//   * перенос длинных строк по словам (слово не рвётся посередине);
//   * перемещение по словам: Ctrl+←/→ (и Alt+B/Alt+F), удаление слова
//     Ctrl+W; Ctrl+K — удалить до конца строки;
//   * история введённых сообщений: ↑/↓ на краях ввода (внутри многострочного
//     ввода стрелки двигают по строкам, как в обычном терминале);
//   * подсказки slash-команд: при вводе «/» под строкой показываются
//     подходящие команды с описанием, Tab — дополнить.
//
// Все управляющие символы собираются из кодов, чтобы в файле не было
// «сырых» ESC/CR/LF в строковых литералах (см. AGENTS.md).

const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const ESC = String.fromCharCode(27)
const PASTE_START = ESC + '[200~'
const PASTE_END = ESC + '[201~'

// Анимация точек: старт с пустой строки (0 точек), затем рост.
// Ширину выравниваем по максимуму (3), чтобы подсказка не смещалась.
const DOTS = ['', '.', '..', '...']
const DOTS_PAD = '   '
const HINT = theme.dim('  ·  Esc — стоп')

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

// Сколько визуальных строк занимает текст при данной ширине терминала
// (с учётом переноса). Нужно, чтобы курсор/стирание блока не сбивались,
// когда статус длиннее ширины терминала и переносится на 2+ строки.
export function visRows(s: string, cols: number): number {
  const width = Math.max(1, Number(cols) || 80)
  const len = visLen(s)
  return Math.max(1, Math.ceil(len / width))
}

// Видимая длина строки без ANSI-последовательностей.
export function visLen(s: string): number {
  s = String(s)
  let n = 0
  let i = 0
  while (i < s.length) {
    if (s.charCodeAt(i) === 27) {
      i++
      if (s[i] === '[') {
        i++
        while (i < s.length && !/[A-Za-z]/.test(s[i])) i++
        i++
      }
      continue
    }
    n++
    i++
  }
  return n
}

// Раскладка ввода на визуальные строки с учётом ширины терминала.
// Возвращает строки (с префиксом) и позицию курсора в визуальных координатах.
export interface LayoutRow {
  prefix: string
  text: string
  start: number
}

export interface LayoutResult {
  rows: LayoutRow[]
  cursorRow: number
  cursorCol: number
}

export function layoutInput(
  promptStr: string,
  buf: string,
  cursor: number,
  cols: number,
): LayoutResult {
  const width = Math.max(20, Number(cols) || 80)
  const promptW = visLen(promptStr)
  const pad = ' '.repeat(promptW)
  const chars = Array.from(String(buf))
  const cur = Math.max(0, Math.min(Number(cursor) || 0, chars.length))
  const rows = []
  let i = 0
  while (true) {
    const first: boolean = rows.length === 0
    const prefix: string = first ? promptStr : pad
    const avail = Math.max(1, width - promptW)
    const start = i

    // Собираем очередную визуальную строку. Сначала набираем столько
    // символов, сколько влезает (count < avail). Если упёрлись в ширину
    // и следующий символ — не конец строки, откатываемся к последнему
    // пробелу, чтобы не разрывать слово посередине (word-wrap).
    let text = ''
    let count = 0
    let lastSpace = -1 // индекс пробела в text (по Array.from)
    while (i < chars.length && chars[i] !== NL && count < avail) {
      if (chars[i] === ' ') lastSpace = count
      text += chars[i]
      i++
      count++
    }
    const atLineEnd = i >= chars.length || chars[i] === NL
    if (!atLineEnd && count >= avail && lastSpace > 0) {
      // Переносим «хвост» строки на следующую визуальную строку.
      const textChars = Array.from(text)
      const tailLen = textChars.length - lastSpace
      i -= tailLen
      text = textChars.slice(0, lastSpace).join('')
    }

    if (i < chars.length && chars[i] === NL) {
      i++
      rows.push({ prefix, text, start })
      continue
    }
    rows.push({ prefix, text, start })
    if (i >= chars.length) break
  }

  let cursorRow = 0
  let cursorCol = promptW
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const len = Array.from(row.text).length
    const from = row.start
    const to = row.start + len
    if (cur >= from && cur <= to) {
      const next = rows[r + 1]
      if (cur === to && next && next.start === to) continue
      cursorRow = r
      cursorCol = promptW + (cur - from)
      break
    }
  }
  return { rows, cursorRow, cursorCol }
}

export interface SlashCommand {
  name: string
  description: string
}

export interface LineEditorOptions {
  prompt?: string
  commands?: SlashCommand[]
}

export class LineEditor {
  promptStr: string
  buf: string
  cursor: number
  statusText: string
  pendingText: string | null
  rendered: boolean
  cursorRowFromTop: number
  busy: boolean
  onSubmit: ((text: string) => void) | null
  onEscape: (() => void) | null
  onCtrlC: (() => void) | null
  _inPaste: boolean
  _dotTimer: ReturnType<typeof setInterval> | null
  _dotPhase: number
  _thinkBase: string
  _wasRaw: boolean
  _onData: (b: Buffer) => void
  // История отправленных сообщений (для стрелок вверх/вниз).
  history: string[]
  _histIndex: number
  _histDraft: string
  // Подсказки slash-команд (показываются при вводе «/»).
  slashCommands: SlashCommand[]
  _suggestCount: number

  constructor({ prompt = '> ', commands = [] }: LineEditorOptions = {}) {
    this.promptStr = prompt
    this.buf = ''
    this.cursor = 0
    this.statusText = ''
    this.pendingText = null
    this.rendered = false
    this.cursorRowFromTop = 0
    this.busy = false
    this.onSubmit = null
    this.onEscape = null
    this.onCtrlC = null
    this._inPaste = false
    this._dotTimer = null
    this._dotPhase = 0
    this._thinkBase = ''
    this._wasRaw = false
    this._onData = (b: Buffer) => this._handle(b)
    this.history = []
    this._histIndex = 0
    this._histDraft = ''
    this.slashCommands = commands
    this._suggestCount = 0
  }

  // Список подсказок для текущего ввода. Показываем, только когда строка
  // начинается с «/» и это одно слово (без пробелов/переводов строк) — как
  // автодополнение команд в Claude Code.
  _suggestions(): SlashCommand[] {
    const b = this.buf
    if (!b.startsWith('/')) return []
    if (b.includes(NL) || b.includes(' ')) return []
    const q = b.toLowerCase()
    return this.slashCommands.filter((c) => c.name.toLowerCase().startsWith(q))
  }

  // Tab: дополнить команду до общего префикса; если совпадение одно —
  // подставить его целиком и добавить пробел.
  _completeCommand() {
    const sugg = this._suggestions()
    if (!sugg.length) return
    if (sugg.length === 1) {
      this.buf = sugg[0].name + ' '
      this.cursor = Array.from(this.buf).length
      return
    }
    let prefix = sugg[0].name
    for (const c of sugg) {
      while (!c.name.toLowerCase().startsWith(prefix.toLowerCase())) {
        prefix = prefix.slice(0, -1)
      }
    }
    if (prefix.length > this.buf.length) {
      this.buf = prefix
      this.cursor = Array.from(this.buf).length
    }
  }

  start() {
    const stdin = process.stdin
    if (!stdin.isTTY || !stdin.setRawMode) return false
    this._wasRaw = stdin.isRaw
    stdin.setRawMode(true)
    stdin.resume()
    process.stdout.write(ESC + '[?2004h')
    stdin.on('data', this._onData)
    this._writeBlock()
    return true
  }

  dispose() {
    const stdin = process.stdin
    stdin.removeListener('data', this._onData)
    process.stdout.write(ESC + '[?2004l')
    this._stopDots()
    if (this.rendered) this._eraseBlock()
    if (stdin.setRawMode) stdin.setRawMode(this._wasRaw || false)
  }

  // Временно отдать терминал внешнему UI (например, меню /config):
  // снимаем свой обработчик ввода и стираем блок ввода, чтобы чужой вывод
  // не накладывался на строку ввода. Парно с resume().
  pause() {
    const stdin = process.stdin
    this._stopDots()
    if (this.rendered) this._eraseBlock()
    stdin.removeListener('data', this._onData)
    process.stdout.write(ESC + '[?2004l')
  }

  resume() {
    const stdin = process.stdin
    if (!stdin.isTTY || !stdin.setRawMode) return
    this._wasRaw = stdin.isRaw
    stdin.setRawMode(true)
    stdin.resume()
    process.stdout.write(ESC + '[?2004h')
    stdin.on('data', this._onData)
    this._writeBlock()
    this._render()
  }

  setPrompt(str: string): void {
    this.promptStr = str
    this._render()
  }

  // Обновить описания slash-команд (смена языка интерфейса).
  setCommands(commands: SlashCommand[]): void {
    this.slashCommands = commands
    this._render()
  }

  clear() {
    this.buf = ''
    this.cursor = 0
    this._render()
  }

  // ---------- отрисовка ----------

  _eraseBlock() {
    if (!this.rendered) return
    if (this.cursorRowFromTop > 0) {
      process.stdout.write(ESC + '[' + this.cursorRowFromTop + 'A')
    }
    process.stdout.write(CR + ESC + '[J')
    this.rendered = false
  }

  _writeBlock() {
    const cols = process.stdout.columns || 80
    let out = ''
    let top = 0
    if (this.statusText) {
      out += this.statusText + NL
      // Статус может переноситься на несколько строк — учитываем это,
      // иначе стирание блока промахивается и статусы «стопкой» копятся.
      top = visRows(this.statusText, cols)
    }
    const lay = layoutInput(this.promptStr, this.buf, this.cursor, cols)
    out += lay.rows.map((r) => r.prefix + r.text).join(NL)

    // Подсказки slash-команд рисуем НИЖЕ строки ввода. Курсор потом
    // возвращаем вверх, на строку ввода, поэтому cursorRowFromTop не меняется.
    const sugg = this._suggestions()
    const shown = sugg.slice(0, 8)
    this._suggestCount = shown.length
    if (shown.length) {
      const maxName = Math.max(...shown.map((c) => c.name.length))
      const lines = shown.map((c) => {
        const name = theme.prompt(c.name.padEnd(maxName))
        const desc = theme.dim('  ' + c.description)
        return '   ' + name + desc
      })
      out += NL + lines.join(NL)
      const hidden = sugg.length - shown.length
      if (hidden > 0) out += NL + theme.dim('   …ещё ' + hidden)
    }

    process.stdout.write(out)
    const lastRow = lay.rows.length - 1
    // Курсор вверх: сначала на строку ввода внутри lay, затем ещё на
    // строки подсказок (если они есть) — курсор должен стоять на вводе.
    const linesBelow = shown.length ? shown.length + (sugg.length > shown.length ? 1 : 0) : 0
    const up = lastRow - lay.cursorRow + linesBelow
    if (up > 0) process.stdout.write(ESC + '[' + up + 'A')
    process.stdout.write(CR)
    if (lay.cursorCol > 0) process.stdout.write(ESC + '[' + lay.cursorCol + 'C')
    this.rendered = true
    this.cursorRowFromTop = top + lay.cursorRow
  }

  _render() {
    this._eraseBlock()
    this._writeBlock()
  }

  // Напечатать блок ВЫШЕ строки ввода и вернуть строку ввода на место.
  printAbove(text: unknown): void {
    this._eraseBlock()
    process.stdout.write(String(text) + NL)
    this._writeBlock()
  }

  // ---------- интерфейс, совместимый со спиннером ----------

  setStatus(text: string): void {
    this.statusText = text || ''
    this._render()
  }

  _stopDots() {
    if (this._dotTimer) {
      clearInterval(this._dotTimer)
      this._dotTimer = null
    }
  }

  _dots(n: number): string {
    // Точки того же цвета, что и база, и фиксированной ширины — иначе
    // подсказка справа «прыгает» при смене фазы анимации.
    return theme.brown(DOTS[n] + DOTS_PAD.slice(DOTS[n].length))
  }

  _startThinking() {
    if (this.pendingText) {
      this.setStatus(theme.prompt('✎ ') + this.pendingText + HINT)
      return
    }
    this._thinkBase = theme.brown(stripEllipsis(randomThinkingPhrase()))
    this._dotPhase = 0
    this.setStatus(this._thinkBase + this._dots(0) + HINT)
    this._stopDots()
    this._dotTimer = setInterval(() => {
      this._dotPhase = (this._dotPhase + 1) % DOTS.length
      this.setStatus(this._thinkBase + this._dots(this._dotPhase) + HINT)
    }, 400)
    if (this._dotTimer.unref) this._dotTimer.unref()
  }

  thinking() {
    this._startThinking()
  }

  setPending(text: string | null): void {
    this.pendingText = text && String(text).length ? String(text) : null
    if (this.pendingText) {
      this._stopDots()
      this.setStatus(theme.prompt('✎ ') + this.pendingText + HINT)
    } else {
      this._startThinking()
    }
  }

  stop() {
    this._stopDots()
    this.setStatus('')
  }

  toolCall(name: string, args: unknown): void {
    const preview = safeJson(args).slice(0, 120)
    this.printAbove(theme.tool('🔧 ' + name) + ' ' + theme.dim(preview))
  }

  toolResult(result: unknown): void {
    const text = typeof result === 'string' ? result : safeJson(result)
    const preview = text.slice(0, 200).split(NL).join(' ↵ ')
    this.printAbove(theme.toolResult('   → ' + preview))
  }

  assistant(msg: string): void {
    this.stop()
    const rendered = renderMarkdown(msg)
    this.printAbove(
      NL + theme.assistant('● Ответ') + NL + rendered + NL + theme.dim('─'.repeat(60)),
    )
  }

  // ---------- ввод ----------

  _submit() {
    const text = this.buf
    if (!text.trim()) {
      this._render()
      return
    }
    // В историю — только непустые и не дублирующие прошлое сообщение.
    if (text.trim() && this.history[this.history.length - 1] !== text) {
      this.history.push(text)
    }
    this._histIndex = this.history.length
    this._histDraft = ''
    this.buf = ''
    this.cursor = 0
    this.pendingText = null
    this._stopDots()
    this.statusText = ''
    this.printAbove(theme.user('❯ ') + text)
    if (this.onSubmit) this.onSubmit(text)
  }

  _insert(text: string): void {
    const chars = Array.from(this.buf)
    const ins = Array.from(String(text))
    const next = chars.slice(0, this.cursor).concat(ins, chars.slice(this.cursor))
    this.buf = next.join('')
    this.cursor += ins.length
  }

  // Вставить перевод строки. Если курсор стоит сразу после символа «\»
  // (как в Claude Code), символ удаляется — чтобы «\» + Enter давали
  // обычный перенос без лишней обратной косой черты в тексте.
  _insertNewline(): void {
    const chars = Array.from(this.buf)
    if (this.cursor > 0 && chars[this.cursor - 1] === '\\') {
      chars.splice(this.cursor - 1, 1)
      this.buf = chars.join('')
      this.cursor--
    }
    this._insert(NL)
  }

  _backspace() {
    if (this.cursor <= 0) return
    const chars = Array.from(this.buf)
    chars.splice(this.cursor - 1, 1)
    this.buf = chars.join('')
    this.cursor--
  }

  _delete() {
    const chars = Array.from(this.buf)
    if (this.cursor >= chars.length) return
    chars.splice(this.cursor, 1)
    this.buf = chars.join('')
  }

  _left() {
    if (this.cursor > 0) this.cursor--
  }

  _right() {
    if (this.cursor < Array.from(this.buf).length) this.cursor++
  }

  _home() {
    const chars = Array.from(this.buf)
    let i = this.cursor
    while (i > 0 && chars[i - 1] !== NL) i--
    this.cursor = i
  }

  _end() {
    const chars = Array.from(this.buf)
    let i = this.cursor
    while (i < chars.length && chars[i] !== NL) i++
    this.cursor = i
  }

  // Курсор на первой/последней ВИЗУАЛЬНОЙ строке (с учётом переноса).
  // Нужно, чтобы Up/Down работали как история на краях ввода, а внутри —
  // как перемещение по строкам, как в обычном терминале.
  _onFirstVisualLine(): boolean {
    const cols = process.stdout.columns || 80
    const lay = layoutInput(this.promptStr, this.buf, this.cursor, cols)
    return lay.cursorRow === 0
  }

  _onLastVisualLine(): boolean {
    const cols = process.stdout.columns || 80
    const lay = layoutInput(this.promptStr, this.buf, this.cursor, cols)
    return lay.cursorRow === lay.rows.length - 1
  }

  _up() {
    const chars = Array.from(this.buf)
    let start = this.cursor
    while (start > 0 && chars[start - 1] !== NL) start--
    if (start === 0) return
    const col = this.cursor - start
    const prevEnd = start - 1
    let prevStart = prevEnd
    while (prevStart > 0 && chars[prevStart - 1] !== NL) prevStart--
    this.cursor = prevStart + Math.min(col, prevEnd - prevStart)
  }

  _down() {
    const chars = Array.from(this.buf)
    let end = this.cursor
    while (end < chars.length && chars[end] !== NL) end++
    if (end >= chars.length) return
    let lineStart = this.cursor
    while (lineStart > 0 && chars[lineStart - 1] !== NL) lineStart--
    const col = this.cursor - lineStart
    const nextStart = end + 1
    let nextEnd = nextStart
    while (nextEnd < chars.length && chars[nextEnd] !== NL) nextEnd++
    this.cursor = nextStart + Math.min(col, nextEnd - nextStart)
  }

  // Перемещение на слово назад (Ctrl+Left / Alt+B): пропускаем пробелы
  // слева, затем идём до начала слова.
  _wordLeft() {
    const chars = Array.from(this.buf)
    let i = this.cursor
    while (i > 0 && /\s/.test(chars[i - 1])) i--
    while (i > 0 && !/\s/.test(chars[i - 1])) i--
    this.cursor = i
  }

  // Перемещение на слово вперёд (Ctrl+Right / Alt+F).
  _wordRight() {
    const chars = Array.from(this.buf)
    let i = this.cursor
    while (i < chars.length && /\s/.test(chars[i])) i++
    while (i < chars.length && !/\s/.test(chars[i])) i++
    this.cursor = i
  }

  // Удаление слова слева (Ctrl+W / Alt+Backspace).
  _deleteWordLeft() {
    const chars = Array.from(this.buf)
    let i = this.cursor
    while (i > 0 && /\s/.test(chars[i - 1])) i--
    while (i > 0 && !/\s/.test(chars[i - 1])) i--
    chars.splice(i, this.cursor - i)
    this.buf = chars.join('')
    this.cursor = i
  }

  // ---------- история ----------

  _historyUp() {
    if (!this.history.length) return
    if (this._histIndex === this.history.length) this._histDraft = this.buf
    if (this._histIndex > 0) {
      this._histIndex--
      this.buf = this.history[this._histIndex]
      this.cursor = Array.from(this.buf).length
    }
  }

  _historyDown() {
    if (!this.history.length) return
    if (this._histIndex < this.history.length - 1) {
      this._histIndex++
      this.buf = this.history[this._histIndex]
    } else {
      this._histIndex = this.history.length
      this.buf = this._histDraft
    }
    this.cursor = Array.from(this.buf).length
  }

  _handle(data: Buffer): void {
    let s = data.toString('utf-8')

    if (!this._inPaste && s === ESC) {
      if (this.onEscape) this.onEscape()
      return
    }

    while (s.length) {
      if (this._inPaste) {
        const end = s.indexOf(PASTE_END)
        if (end === -1) {
          this._insert(s)
          s = ''
        } else {
          this._insert(s.slice(0, end))
          s = s.slice(end + PASTE_END.length)
          this._inPaste = false
        }
        this._render()
        continue
      }

      const pasteAt = s.indexOf(PASTE_START)
      if (pasteAt !== -1) {
        const before = s.slice(0, pasteAt)
        s = s.slice(pasteAt + PASTE_START.length)
        this._inPaste = true
        if (before) {
          this._insert(before)
          this._render()
        }
        continue
      }

      // Shift+Enter, Ctrl+Enter в терминалах с расширенным протоколом
      // и Alt+Enter — вставка перевода строки.
      if (s.startsWith(ESC + '[13;2u')) { this._insertNewline(); s = s.slice(7); this._render(); continue }
      if (s.startsWith(ESC + '[13;5u')) { this._insertNewline(); s = s.slice(7); this._render(); continue }
      if (s.startsWith(ESC + '[27;2;13~')) { this._insertNewline(); s = s.slice(10); this._render(); continue }
      if (s.startsWith(ESC + '[27;5;13~')) { this._insertNewline(); s = s.slice(10); this._render(); continue }
      if (s.startsWith(ESC + NL)) { this._insertNewline(); s = s.slice(2); this._render(); continue }

      const ch = s[0]
      const code = s.charCodeAt(0)
      s = s.slice(1)

      // Enter: если предыдущий символ — «\», Claude-Code-стиль: удаляем
      // «\» и переносим строку; иначе отправляем сообщение.
      // Ctrl+J (code 10) всегда вставляет перевод строки; Ctrl+Enter
      // (ESC[13;5u) и Shift+Enter тоже.
      if (ch === CR) {
        const before = this.cursor > 0 ? Array.from(this.buf)[this.cursor - 1] : ''
        if (before === '\\') { this._insertNewline(); this._render(); continue }
        this._submit(); continue
      }
      if (code === 10) { this._insertNewline(); this._render(); continue }
      if (code === 3) { if (this.onCtrlC) this.onCtrlC(); continue }
      if (code === 4) { if (!this.buf && this.onCtrlC) this.onCtrlC(); continue }
      if (code === 1) { this._home(); this._render(); continue }
      if (code === 5) { this._end(); this._render(); continue }
      if (code === 9) { this._completeCommand(); this._render(); continue }
      if (code === 21) { this.buf = ''; this.cursor = 0; this._render(); continue }
      if (code === 23) { this._deleteWordLeft(); this._render(); continue }
      if (code === 11) {
        // Ctrl+K — удалить от курсора до конца строки.
        const arr = Array.from(this.buf)
        let e = this.cursor
        while (e < arr.length && arr[e] !== NL) e++
        arr.splice(this.cursor, e - this.cursor)
        this.buf = arr.join('')
        this._render(); continue
      }
      if (code === 127 || code === 8) { this._backspace(); this._render(); continue }

      if (code === 27) {
        // Ctrl+Left / Ctrl+Right (xterm: ESC [1;5D / ESC [1;5C;
        // некоторые терминалы: ESC [5D / ESC [5C).
        if (s.startsWith('[1;5D') || s.startsWith('[5D')) {
          this._wordLeft(); s = s.slice(s.startsWith('[1;5D') ? 5 : 3); this._render(); continue
        }
        if (s.startsWith('[1;5C') || s.startsWith('[5C')) {
          this._wordRight(); s = s.slice(s.startsWith('[1;5C') ? 5 : 3); this._render(); continue
        }
        if (s.startsWith('[D')) { this._left(); s = s.slice(2); this._render(); continue }
        if (s.startsWith('[C')) { this._right(); s = s.slice(2); this._render(); continue }
        if (s.startsWith('[A')) {
          // Вверх: на первой визуальной строке — история, иначе — строка выше.
          if (this._onFirstVisualLine()) this._historyUp()
          else this._up()
          s = s.slice(2); this._render(); continue
        }
        if (s.startsWith('[B')) {
          if (this._onLastVisualLine()) this._historyDown()
          else this._down()
          s = s.slice(2); this._render(); continue
        }
        if (s.startsWith('[H') || s.startsWith('[1~')) { this._home(); s = s.slice(s.startsWith('[1~') ? 3 : 2); this._render(); continue }
        if (s.startsWith('[F') || s.startsWith('[4~')) { this._end(); s = s.slice(s.startsWith('[4~') ? 3 : 2); this._render(); continue }
        if (s.startsWith('[3~')) { this._delete(); s = s.slice(3); this._render(); continue }
        // Alt+B / Alt+F — перемещение по словам.
        if (s.startsWith('b') || s.startsWith('B')) { this._wordLeft(); s = s.slice(1); this._render(); continue }
        if (s.startsWith('f') || s.startsWith('F')) { this._wordRight(); s = s.slice(1); this._render(); continue }
        let j = 0
        while (j < s.length && !/[A-Za-z~]/.test(s[j])) j++
        s = s.slice(j + 1)
        continue
      }

      if (code < 32) continue
      this._insert(ch)
      this._render()
    }
  }
}

// Проверка раскладки: node src/input.js --selftest
export function selftest() {
  const cases = [
    { p: '> ', b: 'hello', c: 5, w: 80 },
    { p: '> ', b: 'a' + NL + 'b', c: 3, w: 80 },
    { p: '> ', b: 'x'.repeat(200), c: 200, w: 40 },
    { p: '> ', b: '', c: 0, w: 40 },
  ]
  for (const t of cases) {
    const r = layoutInput(t.p, t.b, t.c, t.w)
    console.log(JSON.stringify({ rows: r.rows.length, row: r.cursorRow, col: r.cursorCol }))
  }
}

if (process.argv[1] && process.argv[1].endsWith('input.js') && process.argv.includes('--selftest')) {
  selftest()
}
