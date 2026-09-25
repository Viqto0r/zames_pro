import { theme } from './theme.js'
import { renderMarkdown } from './markdown.js'
import { randomThinkingPhrase, stripEllipsis } from './spinner.js'
import { translate, type Locale } from './i18n.js'
import {
  AttachmentStore,
  parseImagePaste,
  looksLikeFilePath,
 extractPathToken,
 type Attachment,
} from './attachments.js'

// A permanent input line at the bottom of the terminal + a status/output area above it.
//
// Why a custom editor:
//   * the input line is ALWAYS visible and is not overwritten by the agent's output;
//   * the spinner/status and answers are printed ABOVE the input line (printAbove);
//   * redraw accounts for wrapping by terminal width, so there is no
//     line duplication on multiline input;
//   * multiline input: Enter sends, but if the cursor is right after a «\»,
//     Enter removes the «\» and breaks the line (like in Claude Code).
//     Ctrl+J, Ctrl+Enter and Shift+Enter (in terminals with the extended
//     protocol) always insert a newline;
//   * long lines wrap by words (a word is not split in the middle);
//   * word movement: Ctrl+←/→ (and Alt+B/Alt+F), word deletion
//     Ctrl+W; Ctrl+K — delete to end of line;
//   * input history: ↑/↓ at the edges of the input (inside multiline
//     input the arrows move by lines, like in a normal terminal);
//   * slash-command hints: when you type «/», matching commands with
//     descriptions are shown below the line, Tab completes.
//
// All control characters are assembled from codes so the file has no
// "raw" ESC/CR/LF in string literals (see AGENTS.md).

const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const ESC = String.fromCharCode(27)
const PASTE_START = ESC + '[200~'
const PASTE_END = ESC + '[201~'

// A large paste (3+ lines) is collapsed in the input line into a short
// marker "[Pasted lines#N]" so the line stays readable; the original text is
// kept aside and expanded back on submit. Pastes of 1–2 lines are inserted
// as-is (small pastes are usually short and don't clutter the line).
export const PASTE_MIN_LINES = 3

export interface PasteBlock {
  marker: string
  text: string
}

// Number of lines in a pasted block (the trailing newline doesn't add a line).
export function countPasteLines(raw: string): number {
  const normalized = String(raw).split(CR + NL).join(NL).split(CR).join(NL)
  const trimmed = normalized.replace(/\n+$/, '')
  if (trimmed === '') return 1
  return trimmed.split(NL).length
}

export function formatPasteMarker(lines: number): string {
  return '[Pasted lines#' + lines + ']'
}

// Decide how to represent a pasted block: null — insert as-is (small paste),
// otherwise { marker, text }: the marker goes into the input line, and the
// original text is expanded back on submit.
export function pasteReplacement(raw: string): PasteBlock | null {
  const text = String(raw).split(CR + NL).join(NL).split(CR).join(NL)
  const lines = countPasteLines(text)
  if (lines < PASTE_MIN_LINES) return null
  return { marker: formatPasteMarker(lines), text }
}

// Replace "[Pasted lines#N]" markers with the original pasted text (the first
// occurrence in order — matches the order in which the pastes were inserted).
export function expandPastes(pastes: PasteBlock[], text: string): string {
  let out = text
  for (const p of pastes) {
    const idx = out.indexOf(p.marker)
    if (idx !== -1) {
      out = out.slice(0, idx) + p.text + out.slice(idx + p.marker.length)
    }
  }
  return out
}

// Dot animation: start from an empty string (0 dots), then grow.
// We align the width to the maximum (3) so the hint doesn't shift.
const DOTS = ['', '.', '..', '...']
const DOTS_PAD = '   '

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

// How many visual lines the text occupies at the given terminal width
// (accounting for wrapping). Needed so the cursor/block erase don't drift
// when the status is longer than the terminal width and wraps onto 2+ lines.
export function visRows(s: string, cols: number): number {
  const width = Math.max(1, Number(cols) || 80)
  const len = visLen(s)
  return Math.max(1, Math.ceil(len / width))
}

// Visible length of a line without ANSI sequences.
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

// Layout of the input into visual lines accounting for terminal width.
// Returns the lines (with prefix) and the cursor position in visual coordinates.
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

    // Build the next visual line. First we take as many
    // characters as fit (count < avail). If we hit the width
    // and the next character is not the end of the line, we roll back to the
    // last space so we don't split a word in the middle (word-wrap).
    let text = ''
    let count = 0
    let lastSpace = -1 // index of the space in text (by Array.from)
    while (i < chars.length && chars[i] !== NL && count < avail) {
      if (chars[i] === ' ') lastSpace = count
      text += chars[i]
      i++
      count++
    }
    const atLineEnd = i >= chars.length || chars[i] === NL
    if (!atLineEnd && count >= avail && lastSpace > 0) {
      // Move the "tail" of the line to the next visual line.
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
  locale?: Locale
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
  onSubmit: ((text: string, attachments: Attachment[]) => void) | null
  onEscape: (() => void) | null
  onCtrlC: (() => void) | null
  _inPaste: boolean
  _dotTimer: ReturnType<typeof setInterval> | null
  // True while the dot-animation timer is running. Lets sendPause() update
  // only the base text (remaining seconds) without restarting the timer.
  _animating: boolean
  _dotPhase: number
  _thinkBase: string
  _wasRaw: boolean
  _onData: (b: Buffer) => void
  // History of sent messages (for the up/down arrows).
  history: string[]
  _histIndex: number
  _histDraft: string
  // Slash-command hints (shown when you type «/»).
  slashCommands: SlashCommand[]
  _suggestCount: number
  // Pasted blocks collapsed into markers (expanded back on submit).
  pastes: PasteBlock[]
  _pasteBuf: string
  // Attached images/files (saved to <project>/tmp and sent to the chat).
  attachments: AttachmentStore
  _tmpDir: string
  // Insert callback: receives a pasted image/file from the terminal. Returns
  // the attachment if it was saved, so the editor can show a marker.
  onAttach: ((raw: string) => Attachment | null | Promise<Attachment | null>) | null
  // Clipboard callback: tries to read an image from the OS clipboard when the
  // terminal itself sends no usable data (Ctrl+V, right-click, empty paste).
  onClipboard: (() => Promise<Attachment | null>) | null
  // When locked, the editor ignores text input and Enter (submit). Used while
  // a long operation runs (chat resume/open, /new, self-review): otherwise the
  // user could type and send a message mid-operation, and it would be queued
  // and sent right after the operation, breaking the restored session.
  locked: boolean
  // Interface language for the editor's own labels (hint, answer marker,
  // pause status). Everything the OPERATOR sees must be localized.
  locale: Locale

  constructor({ prompt = '> ', commands = [], locale = 'ru' }: LineEditorOptions = {}) {
    this.locale = locale
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
    this._animating = false
    this._dotPhase = 0
    this._thinkBase = ''
    this._wasRaw = false
    this._onData = (b: Buffer) => this._handle(b)
    this.history = []
    this._histIndex = 0
    this._histDraft = ''
    this.slashCommands = commands
    this._suggestCount = 0
    this.pastes = []
    this._pasteBuf = ''
    this.attachments = new AttachmentStore()
    this._tmpDir = ''
    this.onAttach = null
    this.onClipboard = null
    this.locked = false
  }

  // Read the OS clipboard for an image and insert its marker. Used when the
  // terminal sends no usable paste data (Ctrl+V / right-click / empty paste).
  async _tryClipboard(): Promise<void> {
    if (!this.onClipboard) return
    try {
      const att = await this.onClipboard()
      if (att) {
        this._insert(att.marker)
        this._render()
      }
    } catch {}
  }

  setTmpDir(dir: string): void {
    this._tmpDir = dir
  }

  // List of hints for the current input. We show them only when the line
  // starts with «/» and is a single word (no spaces/newlines) — like
  // command completion in Claude Code.
  _suggestions(): SlashCommand[] {
    const b = this.buf
    if (!b.startsWith('/')) return []
    if (b.includes(NL) || b.includes(' ')) return []
    const q = b.toLowerCase()
    return this.slashCommands.filter((c) => c.name.toLowerCase().startsWith(q))
  }

  // Tab: complete the command up to the common prefix; if there is a single
  // match — insert it whole and add a space.
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

  // Temporarily hand the terminal to an external UI (e.g. the /config menu):
  // we detach our input handler and erase the input block so foreign output
  // doesn't overlap the input line. Paired with resume().
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

  // Lock input while a long operation runs (chat resume/open, /new,
  // self-review). The line stays visible but text input and Enter are ignored,
  // so a message typed mid-operation is not queued and sent afterwards,
  // breaking the restored session. Ctrl+C/Ctrl+D still work so the user can
  // abort.
  lock(status?: string): void {
    this.locked = true
    if (status) this.setStatus(theme.dim(status))
  }

  unlock(): void {
    this.locked = false
    // A lock may have set the status hint ("operation in progress, input is
    // temporarily locked"). If nothing else replaced it (no spinner, no
    // pending text), clear it here — otherwise the hint stays on screen
    // forever after a fast operation like /new.
    if (this.statusText) this.setStatus('')
  }

  setPrompt(str: string): void {
    this.promptStr = str
    this._render()
  }

  // Update the interface language (labels: hint, answer marker, pause).
  setLocale(locale: Locale): void {
    this.locale = locale
    this._render()
  }

  // Update slash-command descriptions (interface language change).
  setCommands(commands: SlashCommand[]): void {
    this.slashCommands = commands
    this._render()
  }

  clear() {
    this.buf = ''
    this.cursor = 0
    this.pastes = []
    this._render()
  }

  // ---------- rendering ----------


 _eraseBlock() {
 if (!this.rendered) return
 const rows = process.stdout.rows || 24
 const up = Math.min(this.cursorRowFromTop, Math.max(0, rows - 1))
 if (up > 0) {
 process.stdout.write(ESC + '[' + up + 'A')
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
      // The status may wrap onto several lines — we account for this,
      // otherwise the block erase misses and statuses pile up.
      top = visRows(this.statusText, cols)
    }
    const lay = layoutInput(this.promptStr, this.buf, this.cursor, cols)
    out += lay.rows.map((r) => r.prefix + r.text).join(NL)

    // We draw the slash-command hints BELOW the input line. We then move the
    // cursor back up to the input line, so cursorRowFromTop doesn't change.
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
      if (hidden > 0) out += NL + theme.dim('   ' + translate(this.locale)('editor.more', { n: hidden }))
    }

    process.stdout.write(out)
    const lastRow = lay.rows.length - 1
    // Move the cursor up: first to the input line within lay, then further by
    // the hint lines (if any) — the cursor must sit on the input.
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

  // Print a block ABOVE the input line and put the input line back.
  printAbove(text: unknown): void {
 this._stopDots()
    this._eraseBlock()
    process.stdout.write(String(text) + NL)
    this._writeBlock()
  }

  // ---------- spinner-compatible interface ----------

  setStatus(text: string): void {
    this.statusText = text || ''
    this._render()
  }

  _stopDots() {
    if (this._dotTimer) {
      clearInterval(this._dotTimer)
      this._dotTimer = null
    }
    this._animating = false
  }

  _dots(n: number): string {
    // The dots are the same color as the base and of fixed width — otherwise
    // the hint on the right "jumps" when the animation phase changes.
    return theme.brown(DOTS[n] + DOTS_PAD.slice(DOTS[n].length))
  }

  // Status-line hint ("Esc — stop"), localized.
  _hint(): string {
    return theme.dim('  ·  ' + translate(this.locale)('spinner.hint'))
  }

  _startThinking() {
    if (this.pendingText) {
      this.setStatus(theme.prompt('✎ ') + this.pendingText + this._hint())
      return
    }
    this._startAnimated(randomThinkingPhrase())
  }

  // Animated status: a brown base text plus a growing "running" dot sequence.
  // Shared by the thinking spinner and the send-pause indicator, so the pause
  // is animated too (previously the pause was a static console line and the
  // dots stayed frozen).
  _startAnimated(baseText: string) {
    this._thinkBase = theme.brown(stripEllipsis(baseText))
    this._dotPhase = 0
    this.setStatus(this._thinkBase + this._dots(0) + this._hint())
    this._stopDots()
    this._dotTimer = setInterval(() => {
      this._dotPhase = (this._dotPhase + 1) % DOTS.length
      this.setStatus(this._thinkBase + this._dots(this._dotPhase) + this._hint())
    }, 400)
    this._animating = true
    if (this._dotTimer.unref) this._dotTimer.unref()
  }

  thinking() {
    this._startThinking()
  }

  // The agent is waiting out the send-interval pause before a real send.
  // Show it as an ANIMATED status with the remaining seconds. The browser
  // calls this repeatedly (once per second), so we update only the base text
  // and keep the running dot timer — otherwise the dots would restart from
  // zero on every update and look frozen on a single dot.
  sendPause(seconds: number) {
    if (this.pendingText) return
    const label = translate(this.locale)('spinner.pause', { n: seconds })
    if (this._animating && this._dotTimer) {
      this._thinkBase = theme.brown(stripEllipsis(label))
      this.setStatus(this._thinkBase + this._dots(this._dotPhase) + this._hint())
      return
    }
    this._startAnimated(label)
  }

  setPending(text: string | null): void {
    this.pendingText = text && String(text).length ? String(text) : null
    if (this.pendingText) {
      this._stopDots()
      this.setStatus(theme.prompt('✎ ') + this.pendingText + this._hint())
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
      NL + theme.assistant(translate(this.locale)('editor.answer')) + NL + rendered + NL + theme.dim('─'.repeat(60)),
    )
  }

  // Warning to the operator (e.g. the agent stopped suspiciously).
  // Printed above the input line without overwriting it.
  warning(msg: string): void {
    this.printAbove(NL + theme.warn('⚠ ' + msg))
  }

  // ---------- input ----------

  _submit() {
    if (this.locked) {
      this._render()
      return
    }
    const display = this.buf
    if (!display.trim()) {
      this._render()
      return
    }
    // The input line shows compact markers "[Pasted lines#N]" instead of large
    // pastes — expand them back into the original text before sending.
    const text = expandPastes(this.pastes, display)
    // Add to history only non-empty messages that don't duplicate the previous one.
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
    // Attachments collected for this message (images/files). They are handed
    // to the browser layer to be attached to the chat.
    const attached = this.attachments.items.slice()
    this.printAbove(theme.user('❯ ') + display)
    this.pastes = []
    this.attachments.reset()
    if (this.onSubmit) this.onSubmit(text, attached)
  }

  _insert(text: string): void {
    const chars = Array.from(this.buf)
    const ins = Array.from(String(text))
    const next = chars.slice(0, this.cursor).concat(ins, chars.slice(this.cursor))
    this.buf = next.join('')
    this.cursor += ins.length
  }

  // Insert a pasted block. Small pastes (1–2 lines) go in as-is; large ones
  // (3+ lines) are collapsed into "[Pasted lines#N]" so the input line stays
  // readable — the original text is expanded back on submit.
  _insertPaste(raw: string): void {
    // A pasted image (a data URL / base64 blob) or a file path is saved to
    // tmp and shown as [image#N] / [file#N] — the marker is attached to the
    // message on submit.
    if (this.onAttach) {
      const asImage = parseImagePaste(raw)
      const trimmed = String(raw).trim()
      const isPath = !asImage && looksLikeFilePath(trimmed)
      if (asImage || isPath) {
        void this._attachAsync(raw)
        return
      }
    }
    this._insertFallback(raw)
  }

  // Save a pasted image/file to tmp and put the [image#N]/[file#N] marker
  // into the input line.
  async _attachAsync(raw: string): Promise<void> {
    if (!this.onAttach) return
    try {
      const att = await this.onAttach(raw)
      if (att) {
        this._insert(att.marker)
        this._render()
        return
      }
    } catch {}
    // Attachment failed (e.g. the path does not exist) — insert the text as-is
    // so nothing is lost.
    this._insertFallback(raw)
    this._render()
  }

  _insertFallback(raw: string): void {
    const rep = pasteReplacement(raw)
    if (!rep) {
      const text = String(raw).split(CR + NL).join(NL).split(CR).join(NL)
      this._insert(text)
      return
    }
    this.pastes.push(rep)
    this._insert(rep.marker)
  }

  // Insert a newline. If the cursor is right after a «\»
  // (like in Claude Code), the character is removed — so «\» + Enter gives
  // an ordinary break without a stray backslash in the text.
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

  // Is the cursor on the first/last VISUAL line (accounting for wrapping).
  // Needed so Up/Down act as history at the edges of the input, and inside —
  // as line movement, like in a normal terminal.
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

  // Move one word back (Ctrl+Left / Alt+B): skip spaces
  // on the left, then go to the start of the word.
  _wordLeft() {
    const chars = Array.from(this.buf)
    let i = this.cursor
    while (i > 0 && /\s/.test(chars[i - 1])) i--
    while (i > 0 && !/\s/.test(chars[i - 1])) i--
    this.cursor = i
  }

  // Move one word forward (Ctrl+Right / Alt+F).
  _wordRight() {
    const chars = Array.from(this.buf)
    let i = this.cursor
    while (i < chars.length && /\s/.test(chars[i])) i++
    while (i < chars.length && !/\s/.test(chars[i])) i++
    this.cursor = i
  }

  // Delete the word on the left (Ctrl+W / Alt+Backspace).
  _deleteWordLeft() {
    const chars = Array.from(this.buf)
    let i = this.cursor
    while (i > 0 && /\s/.test(chars[i - 1])) i--
    while (i > 0 && !/\s/.test(chars[i - 1])) i--
    chars.splice(i, this.cursor - i)
    this.buf = chars.join('')
    this.cursor = i
  }

  // ---------- history ----------

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

    // While locked (a long operation is running), swallow all input except
    // Ctrl+C / Ctrl+D — so the user can still abort, but cannot type a message
    // that would be queued and sent after the operation.
    if (this.locked) {
      if (s.length === 1) {
        const c = s.charCodeAt(0)
        if (c === 3) { if (this.onCtrlC) this.onCtrlC(); return }
        if (c === 4) { if (this.onCtrlC) this.onCtrlC(); return }
      }
      return
    }

    if (!this._inPaste && s === ESC) {
      if (this.onEscape) this.onEscape()
      return
    }

    while (s.length) {
      if (this._inPaste) {
        const end = s.indexOf(PASTE_END)
        if (end === -1) {
          // The paste arrived in several chunks — accumulate until the end marker.
          this._pasteBuf += s
          s = ''
        } else {
          this._pasteBuf += s.slice(0, end)
          s = s.slice(end + PASTE_END.length)
          this._inPaste = false
          if (this._pasteBuf === '') {
            // Empty bracketed paste: many terminals send this for an image on
            // the clipboard (there is no text to deliver). Try the OS clipboard.
            void this._tryClipboard()
          } else {
            this._insertPaste(this._pasteBuf)
          }
          this._pasteBuf = ''
        }
        this._render()
        continue
      }

      const pasteAt = s.indexOf(PASTE_START)
      if (pasteAt !== -1) {
        const before = s.slice(0, pasteAt)
        s = s.slice(pasteAt + PASTE_START.length)
        this._inPaste = true
        this._pasteBuf = ''
        if (before) {
          this._insert(before)
          this._render()
        }
        continue
      }

      // Shift+Enter, Ctrl+Enter in terminals with the extended protocol
      // and Alt+Enter — insert a newline.
      if (s.startsWith(ESC + '[13;2u')) { this._insertNewline(); s = s.slice(7); this._render(); continue }
      if (s.startsWith(ESC + '[13;5u')) { this._insertNewline(); s = s.slice(7); this._render(); continue }
      if (s.startsWith(ESC + '[27;2;13~')) { this._insertNewline(); s = s.slice(10); this._render(); continue }
      if (s.startsWith(ESC + '[27;5;13~')) { this._insertNewline(); s = s.slice(10); this._render(); continue }
      if (s.startsWith(ESC + NL)) { this._insertNewline(); s = s.slice(2); this._render(); continue }

      const ch = s[0]
      const code = s.charCodeAt(0)
      s = s.slice(1)

      // Enter: if the previous character is «\», Claude-Code style: remove
      // the «\» and break the line; otherwise send the message.
      // Ctrl+J (code 10) always inserts a newline; Ctrl+Enter
      // (ESC[13;5u) and Shift+Enter too.
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
      if (code === 21) { this.buf = ''; this.cursor = 0; this.pastes = []; this._render(); continue }
      if (code === 22) {
        // Ctrl+V: terminals rarely deliver an image as text here, so we try the
        // OS clipboard first; if there is no image we fall back to reading the
        // text clipboard via the terminal's own paste (nothing to do).
        void this._tryClipboard()
        continue
      }
      if (code === 23) { this._deleteWordLeft(); this._render(); continue }
      if (code === 11) {
        // Ctrl+K — delete from the cursor to the end of the line.
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
        // some terminals: ESC [5D / ESC [5C).
        if (s.startsWith('[1;5D') || s.startsWith('[5D')) {
          this._wordLeft(); s = s.slice(s.startsWith('[1;5D') ? 5 : 3); this._render(); continue
        }
        if (s.startsWith('[1;5C') || s.startsWith('[5C')) {
          this._wordRight(); s = s.slice(s.startsWith('[1;5C') ? 5 : 3); this._render(); continue
        }
        if (s.startsWith('[D')) { this._left(); s = s.slice(2); this._render(); continue }
        if (s.startsWith('[C')) { this._right(); s = s.slice(2); this._render(); continue }
        if (s.startsWith('[A')) {
          // Up: on the first visual line — history, otherwise — the line above.
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
        // Alt+B / Alt+F — word movement.
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

// Layout check: node src/input.js --selftest
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
