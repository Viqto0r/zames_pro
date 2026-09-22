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
//   * многострочный ввод: Enter отправляет, Ctrl+J (и Shift+Enter в
//     терминалах с расширенным протоколом) вставляют перевод строки.
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
const HINT = theme.dim('  ·  Enter — отправить, Ctrl+J — новая строка, Esc — стоп')

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
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
    let text = ''
    let count = 0
    const start = i
    while (i < chars.length && chars[i] !== NL && count < avail) {
      text += chars[i]
      i++
      count++
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

export interface LineEditorOptions {
  prompt?: string
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

  constructor({ prompt = '> ' }: LineEditorOptions = {}) {
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

  setPrompt(str: string): void {
    this.promptStr = str
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
      top = 1
    }
    const lay = layoutInput(this.promptStr, this.buf, this.cursor, cols)
    out += lay.rows.map((r) => r.prefix + r.text).join(NL)
    process.stdout.write(out)
    const lastRow = lay.rows.length - 1
    const up = lastRow - lay.cursorRow
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

      // Shift+Enter в терминалах с расширенным протоколом и Alt+Enter.
      if (s.startsWith(ESC + '[13;2u')) { this._insert(NL); s = s.slice(7); this._render(); continue }
      if (s.startsWith(ESC + '[27;2;13~')) { this._insert(NL); s = s.slice(10); this._render(); continue }
      if (s.startsWith(ESC + NL)) { this._insert(NL); s = s.slice(2); this._render(); continue }

      const ch = s[0]
      const code = s.charCodeAt(0)
      s = s.slice(1)

      if (ch === CR) { this._submit(); continue }
      if (code === 10) { this._insert(NL); this._render(); continue }
      if (code === 3) { if (this.onCtrlC) this.onCtrlC(); continue }
      if (code === 4) { if (!this.buf && this.onCtrlC) this.onCtrlC(); continue }
      if (code === 1) { this._home(); this._render(); continue }
      if (code === 5) { this._end(); this._render(); continue }
      if (code === 21) { this.buf = ''; this.cursor = 0; this._render(); continue }
      if (code === 127 || code === 8) { this._backspace(); this._render(); continue }

      if (code === 27) {
        if (s.startsWith('[D')) { this._left(); s = s.slice(2); this._render(); continue }
        if (s.startsWith('[C')) { this._right(); s = s.slice(2); this._render(); continue }
        if (s.startsWith('[A')) { this._up(); s = s.slice(2); this._render(); continue }
        if (s.startsWith('[B')) { this._down(); s = s.slice(2); this._render(); continue }
        if (s.startsWith('[H') || s.startsWith('[1~')) { this._home(); s = s.slice(s.startsWith('[1~') ? 3 : 2); this._render(); continue }
        if (s.startsWith('[F') || s.startsWith('[4~')) { this._end(); s = s.slice(s.startsWith('[4~') ? 3 : 2); this._render(); continue }
        if (s.startsWith('[3~')) { this._delete(); s = s.slice(3); this._render(); continue }
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
