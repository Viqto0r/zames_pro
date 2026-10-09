import { theme, divider } from './theme.js'
import { renderMarkdown } from './markdown.js'
import { contentWidth } from './width.js'
import {
  randomThinkingPhrase,
  stripEllipsis,
  DOTS,
  renderDots,
} from './spinner.js'
import { translate, type Locale } from './i18n.js'
import {
  AttachmentStore,
  parseImagePaste,
  looksLikeFilePath,
  type Attachment,
} from './attachments.js'
import {
  NL,
  CR,
  ESC,
  PASTE_START,
  PASTE_END,
  SUGGEST_PAGE,
  pasteReplacement,
  expandPastes,
  safeJson,
  visRows,
  visLen,
  charWidth,
  layoutInput,
  formatTokenStatus,
  tokenStatusLevel,
  truncateToWidth,
  wrapToWidth,
  CONTEXT_LIMIT,
  type PasteBlock,
  type SlashCommand,
  type LineEditorOptions,
} from './input/layout.js'

// The pure layout/formatting helpers (visual rows, cursor position, visible
// width, paste markers, token formatting) live in ./input/layout.js. They are
// re-exported here so every existing import from './input.js' keeps working,
// and so tests can import them from either module (C3 step 3).
export {
  PASTE_MIN_LINES,
  SUGGEST_PAGE,
  isSubsequence,
  countPasteLines,
  formatPasteMarker,
  pasteReplacement,
  expandPastes,
  visRows,
  visLen,
  charWidth,
  layoutInput,
  tokenStatusLevel,
  formatTokenStatus,
  formatCompactTokens,
  truncateToWidth,
  wrapToWidth,
  CONTEXT_LIMIT,
  CONTEXT_YELLOW_PCT,
  CONTEXT_RED_PCT,
  type PasteBlock,
  type SlashCommand,
  type LineEditorOptions,
  type LayoutRow,
  type LayoutResult,
} from './input/layout.js'

// PURE slash-command suggestion logic (match / paging / completion), split out
// of the class so the fuzzy match is unit-tested without driving the editor.
import {
  matchSlashCommands,
  suggestWindow,
  completeSlashCommand,
} from './input/suggest.js'

// How long a lone ESC is held before it is treated as the Escape key (and not
// as the head of a control sequence split across two reads). 40ms is below a
// human "two Escapes" interval but above typical chunk-split latency.
export const ESC_DISAMBIGUATE_MS = 40

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

export class LineEditor {
  promptStr: string
  buf: string
  cursor: number
  statusText: string
  pendingText: string | null
  rendered: boolean
  cursorRowFromTop: number
  // Number of rows occupied by the status/spinner block above the input line,
  // as computed by the last _writeBlock(). _renderInputOnly() uses it to keep
  // cursorRowFromTop correct without repainting the status.
  _statusTop: number
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
  // When the current animated phase started, so the status can show its
  // elapsed time. 0 when nothing is animating.
  _animStart: number
  _thinkBase: string
  // Explicit lifecycle state of the send ('generating' | 'paused' |
  // 'settled' | ''). The thinking spinner already shows ACTIVITY, but it does
  // not tell a throttle pause from a real generation — a long reasoning turn
  // and a wait for the rate-limit slot look identical. Only 'generating' shows
  // a prefix (see _stateLabel); the field also gates the clean-up in stop().
  _sendState: string
  // The last rendered status row(s) (status + right-aligned context). Cached so
  // a re-render driven by TYPING (the buffer changed, the status did not) can
  // skip erasing and re-printing the status line entirely. On terminals like
  // Tabby a full erase+rewrite on every keystroke makes the whole screen blink;
  // keeping the status untouched removes that flicker. Cleared whenever the
  // status genuinely changes so the cache can never go stale.
  _lastStatusBlock: string
  // Rows occupied by the WHOLE block (status + input + hints) at the last
  // write. When the block SHRINKS (the pause status disappears, the input
  // unwraps) the erase leaves the cursor at the old block top; printing a
  // shorter block then ends above the screen bottom, so the footer floated with
  // blank rows below it. Padding the redraw with (prev - new) newlines pushes
  // it back down to the bottom (see _padShrink).
  _blockRows: number
  _wasRaw: boolean
  _onData: (b: Buffer) => void
  // True after a resize: the next render must RE-PIN the block
  // (home + pad to bottom) instead of trusting the relative `ESC[n A` erase,
  // whose old block row is stale after the terminal re-flowed.
  _resizeRepin: boolean
  // On SIGWINCH we redraw the whole block so the layout follows the new
  // terminal width. Debounced: a drag fires many resize events. `_onResize`
  // is stored so it can be removed in dispose().
  _onResize: () => void
  _resizeTimer: ReturnType<typeof setTimeout> | null
  // ESC disambiguation (N29): a read may end on a bare ESC that is really the
  // head of a control sequence split across two reads. We hold it briefly and
  // fire onEscape only if no tail arrives.
  _escPending: boolean
  _escTimer: ReturnType<typeof setTimeout> | null
  // History of sent messages (for the up/down arrows).
  history: string[]
  _histIndex: number
  _histDraft: string
  // Incremental reverse-search over the history (Ctrl+R), bash-style.
  _searchMode: boolean
  _searchQuery: string
  _searchIndex: number
  _searchSavedBuf: string
  // Called after every submit with the new full history, so the caller can
  // persist it (the history otherwise dies with the process).
  onHistoryChange: ((history: string[]) => void) | null
  // Snapshots of {buf, cursor} taken before each edit, so Ctrl+_ can undo a
  // slip (a fat-fingered Ctrl+U / Ctrl+K used to wipe the whole line with no
  // way back). Capped so a long session cannot grow it without bound.
  _undoStack: Array<{ buf: string; cursor: number }>
  // True while a run of plain typing is in progress, so one undo snapshot
  // covers the whole run instead of every character.
  _typingRun: boolean
  // Slash-command hints (shown when you type «/»).
  slashCommands: SlashCommand[]
  _suggestCount: number
  // Scroll window of the suggestion list and the currently highlighted entry
  // (Ctrl+N/P move the highlight; Enter inserts it). Without these the list
  // was capped at 8 and the rest were unreachable.
  _suggestOffset: number
  _suggestSelected: number
  // The buffer the suggestion highlight/scroll was computed for; when the
  // buffer changes the selection resets to the top.
  _suggestQuery: string
  // Pasted blocks collapsed into markers (expanded back on submit).
  pastes: PasteBlock[]
  _pasteBuf: string
  // Attached images/files (saved to <project>/tmp and sent to the chat).
  attachments: AttachmentStore
  _tmpDir: string
  // Insert callback: receives a pasted image/file from the terminal. Returns
  // the attachment if it was saved, so the editor can show a marker.
  onAttach:
    ((raw: string) => Attachment | null | Promise<Attachment | null>) | null
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
  // Token context for the status line: the compact count (10k/125k) plus the
  // percentage of the context limit, right-aligned above the input line. Null
  // hides it. Updated by the caller from browser.getLastTokenUsage().
  contextStatus: string | null
  // The raw token count behind contextStatus (for the color level).
  contextTokens: number | null
  // Number of messages waiting in the queue, shown as a small "⧗N" badge in
  // the status line so the operator sees that typed-ahead messages are still
  // pending. 0 hides it. Updated by the caller.
  queueLength: number
  // A callback the editor calls before every render to read the CURRENT queue
  // length, so the badge stays live without the caller polling.
  onQueueQuery: (() => number) | null
  // A callback the editor calls before every render to read the agent's
  // current task-list summary ("tasks: 2/5"), empty when there is no list.
  onTasksQuery: (() => string) | null
  // Extra status text produced by an external command (N37 statusLine hook).
  // Set via setStatusLine(); shown before the queue/tasks badges. Kept as a
  // plain field because the CALLER runs the command on its own timer (a
  // per-render spawn would block typing).
  statusLine: string
  // Whether the DeepSeek "Deep thinking" / "Smart search" toggles are ON.
  // Shown as two colored icons before the context counter: a dim gray icon
  // means off, a teal-green icon means on.
  thinkingEnabled: boolean
  searchEnabled: boolean
  // A callback the editor calls to fetch the CURRENT toggle states before
  // every render, so the icons follow the live chat state.
  onToggleQuery:
    (() => { deepThinking: boolean; webSearch: boolean } | null) | null
  // A callback the editor calls to fetch the CURRENT token count before every
  // status render, so the status line stays fresh without the caller polling.
  onContextQuery: (() => number | null) | null
  // The context window size used for the fill percentage and its color. Kept
  // as a mutable field (set from config.ui.contextLimit) so the status bar
  // reflects the real limit instead of a hardcoded constant.
  contextLimit: number

  constructor({
    prompt = '> ',
    commands = [],
    locale = 'ru',
  }: LineEditorOptions = {}) {
    this.locale = locale
    this.promptStr = prompt
    this.buf = ''
    this.cursor = 0
    this.statusText = ''
    this.pendingText = null
    this.rendered = false
    this.cursorRowFromTop = 0
    this._statusTop = 0
    this.busy = false
    this.onSubmit = null
    this.onEscape = null
    this.onCtrlC = null
    this._inPaste = false
    this._dotTimer = null
    this._animating = false
    this._dotPhase = 0
    this._animStart = 0
    this._thinkBase = ''
    this._sendState = ''
    this._lastStatusBlock = ''
    this._blockRows = 0
    this._resizeRepin = false
    this._wasRaw = false
    this._onData = (b: Buffer) => this._handle(b)
    this._resizeTimer = null
    this._escPending = false
    this._escTimer = null
    this._onResize = () => {
      // Debounce: a window drag fires a burst of SIGWINCH events. We wait a
      // short moment, then redraw the block at the NEW width.
      if (this._resizeTimer) clearTimeout(this._resizeTimer)
      this._resizeTimer = setTimeout(() => {
        this._resizeTimer = null
        // Repaint the status + input block at the NEW width. The relative
        // `ESC[n A` erase cannot be trusted after a resize: the terminal
        // re-flowed the longer wrapped lines and the old block row is stale,
        // so the block would be redrawn at the wrong row. The block is
        // therefore re-pinned from scratch on the next write (clear + home +
        // pad to bottom).
        this._resizeRepin = true
        this._render()
      }, 120)
      if (this._resizeTimer.unref) this._resizeTimer.unref()
    }
    this.history = []
    this._histIndex = 0
    this._histDraft = ''
    this._searchMode = false
    this._searchQuery = ''
    this._searchIndex = -1
    this._searchSavedBuf = ''
    this.onHistoryChange = null
    this._undoStack = []
    this._typingRun = false
    this.slashCommands = commands
    this._suggestCount = 0
    this._suggestOffset = 0
    this._suggestSelected = -1
    this._suggestQuery = ''
    this.pastes = []
    this._pasteBuf = ''
    this.attachments = new AttachmentStore()
    this._tmpDir = ''
    this.onAttach = null
    this.onClipboard = null
    this.locked = false
    this.contextStatus = null
    this.contextTokens = null
    this.thinkingEnabled = false
    this.searchEnabled = false
    this.contextLimit = CONTEXT_LIMIT
    this.onToggleQuery = null
    this.onContextQuery = null
    this.queueLength = 0
    this.statusLine = ''
    this.onQueueQuery = null
    this.onTasksQuery = null
  }

  // Refresh the toggle icon states from onToggleQuery (if wired) before a
  // render. A broken callback must never break the render.
  _refreshToggles(): void {
    if (!this.onToggleQuery) return
    try {
      const s = this.onToggleQuery()
      if (s) {
        this.thinkingEnabled = !!s.deepThinking
        this.searchEnabled = !!s.webSearch
      }
    } catch {
      // ignore
    }
  }

  // The token status for the CURRENT render: refreshed from onContextQuery
  // when wired, otherwise the last value passed to setContextStatus().
  _contextForRender(): string | null {
    if (this.onContextQuery) {
      try {
        const n = this.onContextQuery()
        this.contextTokens = typeof n === 'number' ? n : null
        this.contextStatus =
          n === null || n === undefined
            ? null
            : formatTokenStatus(n, this.contextLimit) || null
      } catch {
        // A broken callback must never break the render.
      }
    }
    return this.contextStatus
  }

  // The context text colored by fill level: green (ok), yellow (warn),
  // red (high). A leading marker repeats the level as TEXT, so the signal
  // survives on a terminal without color and for a color-blind operator.
  _contextText(): string {
    const ctx = this._contextForRender()
    if (!ctx) return ''
    const level = tokenStatusLevel(this.contextTokens, this.contextLimit)
    if (level === 'high') return theme.error('⛔ ' + ctx)
    if (level === 'warn') return theme.warn('▲ ' + ctx)
    return theme.success(ctx)
  }

  // The queue badge ("⧗N") shown before the context counter when messages are
  // waiting. Returns '' when the queue is empty, so it never clutters an idle
  // status line. Refreshed from onQueueQuery before every render when wired.
  _queueBadge(): string {
    if (this.onQueueQuery) {
      try {
        const n = this.onQueueQuery()
        this.queueLength = typeof n === 'number' && n > 0 ? n : 0
      } catch {
        // A broken callback must never break the render.
      }
    }
    if (this.queueLength <= 0) return ''
    return theme.warn('⧗' + this.queueLength) + ' '
  }

  // The agent's task-list summary ("tasks: 2/5") shown before the context
  // counter. Empty when there is no list, so an idle status is not cluttered.
  // Refreshed from onTasksQuery before every render when wired.
  _tasksBadge(): string {
    if (!this.onTasksQuery) return ''
    try {
      const s = this.onTasksQuery()
      return s ? theme.system(s) + ' ' : ''
    } catch {
      // A broken callback must never break the render.
      return ''
    }
  }

  // The statusLine hook text (N37), shown before the queue/tasks badges.
  // A trailing space separates it from whatever follows; empty hides it.
  _statusLineBadge(): string {
    return this.statusLine ? theme.system(this.statusLine) + ' ' : ''
  }

  // Icons for the DeepSeek toggles: 🧠 "Deep thinking" and 🌐 "Smart search",
  // shown before the context counter. Only the ENABLED toggles are shown, so
  // the state is unambiguous WITHOUT relying on the terminal coloring the
  // emoji: an icon present = ON, absent = OFF. Emoji are (almost) never
  // colored by ANSI, so a "dim" vs "green" pair of the SAME emoji would look
  // identical — that is why the disabled icon is hidden instead.
  _toggleIcons(): string {
    const TEXT = '\uFE0E'
    const parts: string[] = []
    if (this.thinkingEnabled) parts.push(theme.toggleOn('🧠' + TEXT))
    if (this.searchEnabled) parts.push(theme.toggleOn('🌐' + TEXT))
    return parts.length ? parts.join(' ') + ' ' : ''
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
  // command completion in Claude Code. The match is fuzzy: an exact prefix
  // first, then a substring, then a subsequence (e.g. "hst" -> "/history"),
  // so a half-remembered command name still surfaces. Order is preserved.
  _suggestions(): SlashCommand[] {
    return matchSlashCommands(this.buf, this.slashCommands)
  }

  // Render the suggestion block for the current query. `offset` scrolls the
  // window so Ctrl+N/P can page through more than the visible size (the list
  // used to be silently capped at 8). Returns the lines to print BELOW the
  // input and how many rows they occupy.
  _suggestionLines(offset: number): { lines: string[]; rows: number } {
    const sugg = this._suggestions()
    // The buffer changed since the last highlight -> drop the selection and
    // reset the window to the top, so a stale highlight never sticks to an
    // unrelated entry.
    if (this.buf !== this._suggestQuery) {
      this._suggestQuery = this.buf
      this._suggestSelected = 0
      this._suggestOffset = 0
    }
    if (!sugg.length) return { lines: [], rows: 0 }
    const { shown, off, moreCount } = suggestWindow(sugg, offset)
    this._suggestOffset = off
    this._suggestCount = sugg.length
    const label = (c: SlashCommand): string =>
      c.hint ? c.name + ' ' + c.hint : c.name
    const maxName = Math.max(...shown.map((c) => label(c).length))
    const lines = shown.map((c, i) => {
      const selected =
        off + i === this._suggestSelected && this._suggestSelected > 0
      const name = theme.prompt(label(c).padEnd(maxName))
      const desc = theme.dim('  ' + c.description)
      return (selected ? theme.prompt(' ▸ ') : '   ') + name + desc
    })
    if (moreCount > 0) {
      const t = translate(this.locale)
      lines.push(
        theme.dim(
          '   ' +
            t('editor.more', { n: String(moreCount) }) +
            '  ' +
            t('editor.page_hint'),
        ),
      )
    }
    return { lines, rows: lines.length }
  }

  // Move the highlight in the suggestion list (Ctrl+N/Ctrl+P). The window
  // scrolls so the highlighted entry stays visible. -1 means "no explicit
  // selection" (Tab then falls back to the common-prefix completion).
  _suggestMove(delta: number): void {
    const sugg = this._suggestions()
    if (!sugg.length) return
    const next = this._suggestSelected + delta
    this._suggestSelected = Math.max(-1, Math.min(sugg.length - 1, next))
    if (this._suggestSelected < 0) {
      this._suggestOffset = 0
    } else if (this._suggestSelected < this._suggestOffset) {
      this._suggestOffset = this._suggestSelected
    } else if (this._suggestSelected >= this._suggestOffset + SUGGEST_PAGE) {
      this._suggestOffset = this._suggestSelected - SUGGEST_PAGE + 1
    }
    this._renderInputOnly()
  }

  // PageUp/PageDown: page the suggestion window by a full SUGGEST_PAGE. When
  // no list is open it is a no-op (PageUp/Down used to be swallowed entirely).
  _suggestPage(delta: number): void {
    const sugg = this._suggestions()
    if (!sugg.length) return
    const max = sugg.length - 1
    const base = this._suggestSelected < 0 ? 0 : this._suggestSelected
    const next = base + delta * SUGGEST_PAGE
    this._suggestSelected = Math.max(0, Math.min(max, next))
    this._suggestOffset = Math.max(
      0,
      Math.min(this._suggestSelected, sugg.length - SUGGEST_PAGE),
    )
    this._renderInputOnly()
  }

  // Tab: complete the command up to the common prefix; if there is a single
  // match — insert it whole and add a space.
  _completeCommand() {
    const next = completeSlashCommand(
      this.buf,
      this._suggestions(),
      this._suggestSelected,
    )
    if (next !== null) {
      this.buf = next
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
    // Redraw on terminal resize so the layout follows the new width instead
    // of leaving artifacts from the old one.
    process.stdout.on('resize', this._onResize)
    // Pin the input block to the BOTTOM of the terminal. A fresh terminal
    // starts the cursor at the top, so without this the input line sits at
    // the top and only "descends" as output accumulates. Filling the viewport
    // with newlines first makes the block start at the bottom, and every
    // later printAbove() pushes content UP while the input stays put.
    this._padToBottom()
    this._writeBlock()
    return true
  }

  // Fill the current viewport with empty lines so the next _writeBlock()
  // lands at the BOTTOM of the terminal. Used at start and after clearScreen.
  // We deliberately emit real newlines (not a cursor-position escape) because
  // the block height is not known yet and scrolling keeps the block's own
  // cursor math (`cursorRowFromTop`) correct.
  _padToBottom(): void {
    const rows = process.stdout.rows || 24
    if (rows > 1) process.stdout.write(NL.repeat(rows - 1))
  }

  dispose() {
    const stdin = process.stdin
    stdin.removeListener('data', this._onData)
    process.stdout.removeListener('resize', this._onResize)
    if (this._resizeTimer) clearTimeout(this._resizeTimer)
    if (this._escTimer) clearTimeout(this._escTimer)
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
    // `pause()` erased our block and handed the terminal to a foreign UI (the
    // /config menu), which may leave the cursor ANYWHERE — after Esc the menu
    // clears its block and parks the cursor at the TOP of the screen. Without
    // re-pinning, the block would be redrawn up there and every later repaint
    // would keep it glued to the top. Re-fill the viewport and forget the
    // stale block height so the editor lands at the bottom again.
    this._lastStatusBlock = ''
    this._blockRows = 0
    // Start from a KNOWN row: the foreign UI may have parked the cursor
    // anywhere (the /config menu leaves it near the top). From home, padding
    // lands exactly on the last screen row.
    process.stdout.write(ESC + '[H')
    this._padToBottom()
    this._writeBlock()
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

  // Update the token-context text shown at the right of the status line.
  setContextStatus(tokens: number | null | undefined): void {
    this.contextTokens =
      typeof tokens === 'number' && Number.isFinite(tokens) ? tokens : null
    this.contextStatus = formatTokenStatus(tokens, this.contextLimit) || null
    this._render()
  }

  // Update the context window size (from config.ui.contextLimit). The next
  // render recomputes the percentage and its color with the new limit.
  // Set the statusLine hook text (N37). The caller runs the command on its
  // own timer; this only stores + repaints. An empty string hides the badge.
  setStatusLine(text: string): void {
    const t = String(text || '').trim()
    if (t === this.statusLine) return
    this.statusLine = t
    this._render()
  }

  setContextLimit(limit: number): void {
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      this.contextLimit = limit
    }
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
    this._lastStatusBlock = ''
  }

  // Erase ONLY the input rows (leave the status block untouched). Used when a
  // keystroke re-renders the line but the status/context did not change: the
  // status stays on screen, only the input area is redrawn. This removes the
  // full-screen flicker on terminals like Tabby, where erasing the whole block
  // on every character made the display blink.
  //
  // `cursorRowInInput` is the cursor's row WITHIN the input area (0-based) as
  // it is currently on screen: we move up exactly that many rows to the input's
  // TOP and clear downward (ESC[J), which also wipes the hint lines below the
  // input. Passing the input's full HEIGHT here (an earlier version did)
  // overshot by `cursorRow` rows whenever the cursor was not on the last visual
  // line, so every keystroke redrew the block one row higher — the input line
  // visibly climbed from the bottom to the top of the screen.
  _eraseInputOnly(cursorRowInInput: number) {
    if (!this.rendered) return
    const rows = process.stdout.rows || 24
    const up = Math.min(Math.max(0, cursorRowInInput), Math.max(0, rows - 1))
    if (up > 0) process.stdout.write(ESC + '[' + up + 'A')
    process.stdout.write(CR + ESC + '[J')
    this.rendered = false
  }

  _writeBlock() {
    const cols = process.stdout.columns || 80
    // After a resize the terminal re-flowed the lines above the block, so
    // the block's ABSOLUTE row changed. But the cursor is still on the input
    // line and `_eraseBlock` moves up by the cursor row WITHIN the block — a
    // RELATIVE move that still lands on the block top row, whatever the
    // reflow did. So we clear ONLY our own block (status + input) and leave
    // the history above it visible and in place. We deliberately do NOT clear
    // the whole viewport (ESC[2J): that pushed the history into the scrollback
    // and left a blank gap between the footer and the text the operator was
    // reading (they had to scroll up to see their own chat). `_blockRows` is
    // kept so the shrink-padding (`_padShrink`) can still push a shorter block
    // back down to the bottom.
    if (this._resizeRepin) {
      this._resizeRepin = false
      this._eraseBlock()
      this._lastStatusBlock = ''
      // Forget the old block height: after a reflow the shrink-padding must
      // not add scroll (it would push the freshly drawn block up and open a
      // gap above the footer). The normal path records the new height.
      this._blockRows = 0
    }
    // Status line above the input: the spinner/answer text on the left and the
    // token context right-aligned on the SAME row (10k · 12%). The context is
    // refreshed from onContextQuery() on every render, so it follows the live
    // DeepSeek counter without a polling timer of its own.
    //
    // `top` MUST count EXACTLY the rows we print, or the next _eraseBlock()
    // moves the cursor to the wrong row and the block (spinner + input) is
    // re-drawn on top of the previous one instead of replacing it — the
    // operator sees the status line duplicated/stacking, most visibly during
    // the send-pause countdown (which re-renders about once per second).
    // The earlier code computed `top = visRows(status + '  ' + ctxText)` even
    // though it PRINTS `status + ' '.repeat(space) + ctxText` with a DIFFERENT
    // total width, so at certain widths `top` disagreed with the printed rows.
    // Both branches below now derive `top` from the exact string they print.
    // Toggle icons (always shown) + the context counter (when known). The
    // icons reflect the live DeepSeek toggles; a fresh chat has no token count
    // but the icons are still meaningful.
    const ctxRaw = this._contextText()
    this._refreshToggles()
    const ctxText =
      this._statusLineBadge() +
      this._queueBadge() +
      this._tasksBadge() +
      this._toggleIcons() +
      ctxRaw
    let statusOut = ''
    let top = 0
    // Never fill a row to the FULL terminal width: on terminals with
    // autowrap (Tabby, iTerm, Windows Terminal) a row that reaches the last
    // column wraps the cursor to the next line, so the following erase moves
    // to the wrong row and the status line STACKS on screen. Keep one column
    // free (effective width = cols - 1) for the right-aligned context and for
    // the padded status row.
    const usable = Math.max(1, cols - 1)
    // An explicit lifecycle phase (generating/settled) is prefixed to the
    // animated status, so the operator can tell a real generation from a
    // quiet spinner. Empty when no phase is active (tool running, idle).
    const stateLabel = this._stateLabel()
    const statusText = stateLabel
      ? stateLabel + ' ' + this.statusText
      : this.statusText
    if (statusText) {
      if (ctxText) {
        // Right-align the context on the SAME row as the status. When the
        // status is too long to leave room, do NOT cram them together (that
        // pushed the trailing `%` past the right edge and it got truncated):
        // put the context on its own line instead.
        const space = usable - visLen(statusText) - visLen(ctxText)
        if (space >= 2) {
          const row = statusText + ' '.repeat(space) + ctxText
          statusOut = row + NL
          top = visRows(row, cols)
        } else {
          statusOut = statusText + NL
          top = visRows(statusText, cols)
          const ctxRow =
            ' '.repeat(Math.max(0, usable - visLen(ctxText))) + ctxText
          statusOut += ctxRow + NL
          top += visRows(ctxRow, cols)
        }
      } else {
        statusOut = statusText + NL
        // The status may wrap onto several lines — we account for this,
        // otherwise the block erase misses and statuses pile up.
        top = visRows(statusText, cols)
      }
    } else if (ctxText) {
      // Idle: no spinner, but the context still belongs on its own line just
      // above the input, right-aligned.
      const ctxRow = ' '.repeat(Math.max(0, usable - visLen(ctxText))) + ctxText
      statusOut = ctxRow + NL
      top = visRows(ctxRow, cols)
    }
    // Incremental re-render: when the status block is byte-identical to what is
    // already on screen (the common case while typing — the buffer changes, the
    // spinner/context does not) we redraw ONLY the input rows. Erasing and
    // re-printing the whole block on every keystroke is what made the display
    // flicker on terminals like Tabby. `top` is recovered from the cache so the
    // cursor math stays correct.
    this._statusTop = top
    const statusBlock = statusOut
    const statusUnchanged =
      this.rendered &&
      !this._resizeRepin &&
      statusBlock === this._lastStatusBlock
    if (statusUnchanged) {
      // Count the real input rows via layout (wrapping aware).
      const layOnly = layoutInput(this.promptStr, this.buf, this.cursor, cols)
      const suggOnly = this._suggestionLines(this._suggestOffset)
      const linesBelowOnly = suggOnly.rows
      // Move up to the INPUT top using the OLD cursor row (the position that is
      // on screen right now), never the input's height.
      this._eraseInputOnly(this.cursorRowFromTop - this._statusTop)
      let outOnly = ''
      outOnly += layOnly.rows.map((r) => r.prefix + r.text).join(NL)
      if (suggOnly.lines.length) {
        outOnly += NL + suggOnly.lines.join(NL)
      }
      // The input may have UNWRAPPED (fewer rows than before) — push the block
      // back to the bottom BEFORE the new content is printed (the padding is
      // plain newlines at the top of the block, which scroll the screen).
      const blockRowsOnly = top + layOnly.rows.length + linesBelowOnly
      this._padShrink(blockRowsOnly, this._blockRows)
      this._blockRows = blockRowsOnly
      process.stdout.write(outOnly)
      const upOnly =
        layOnly.rows.length - 1 - layOnly.cursorRow + linesBelowOnly
      if (upOnly > 0) process.stdout.write(ESC + '[' + upOnly + 'A')
      process.stdout.write(CR)
      if (layOnly.cursorCol > 0)
        process.stdout.write(ESC + '[' + layOnly.cursorCol + 'C')
      this.rendered = true
      this.cursorRowFromTop = top + layOnly.cursorRow
      return
    }
    let out = statusOut
    this._lastStatusBlock = statusBlock
    const lay = layoutInput(this.promptStr, this.buf, this.cursor, cols)
    out += lay.rows.map((r) => r.prefix + r.text).join(NL)

    // We draw the slash-command hints BELOW the input line. We then move the
    // cursor back up to the input line, so cursorRowFromTop doesn't change.
    const sugg = this._suggestionLines(this._suggestOffset)
    if (sugg.lines.length) out += NL + sugg.lines.join(NL)

    const linesBelow = sugg.rows
    // If the block SHRANK (the pause status went away, the input unwrapped),
    // the erase left the cursor at the old block top; printing a shorter block
    // would end above the screen bottom and the footer would float with blank
    // rows below it. Padding with the difference pushes it back to the bottom.
    const blockRows = top + lay.rows.length + linesBelow
    this._padShrink(blockRows, this._blockRows)
    this._blockRows = blockRows

    process.stdout.write(out)
    const lastRow = lay.rows.length - 1
    // Move the cursor up: first to the input line within lay, then further by
    // the hint lines (if any) — the cursor must sit on the input.
    const up = lastRow - lay.cursorRow + linesBelow
    if (up > 0) process.stdout.write(ESC + '[' + up + 'A')
    process.stdout.write(CR)
    if (lay.cursorCol > 0) process.stdout.write(ESC + '[' + lay.cursorCol + 'C')
    this.rendered = true
    this.cursorRowFromTop = top + lay.cursorRow
  }

  // Push the redrawn block back down to the bottom when it got SHORTER than
  // the previous one. `_eraseBlock`/`_eraseInputOnly` put the cursor at the old
  // block top, so emitting (prev - next) newlines scrolls the screen just
  // enough for the new, shorter block to end at the screen bottom again. See
  // _blockRows.
  _padShrink(nextRows: number, prevRows: number): void {
    if (prevRows <= nextRows) return
    const rows = process.stdout.rows || 24
    const pad = Math.min(prevRows - nextRows, Math.max(0, rows - 1))
    if (pad > 0) process.stdout.write(NL.repeat(pad))
  }

  // Public repaint hook: called when an external state that the status line
  // reads (e.g. the toggle icons) changed, so it can be redrawn immediately.
  refreshStatus(): void {
    this._render()
  }

  _render() {
    this._eraseBlock()
    this._writeBlock()
  }

  // Full-screen clear (like /clear in a shell) followed by a fresh repaint of
  // the status + input block. Used by /new and /resume so a new/resumed chat
  // starts on a clean terminal instead of under pages of the previous chat.
  // We do NOT clear the scrollback here: the operator may still want it.
  clearScreen(): void {
    this._eraseBlock()
    process.stdout.write(ESC + '[2J' + ESC + '[H')
    this.rendered = false
    this._lastStatusBlock = ''
    // We are about to re-pin the block to the bottom ourselves, so forget the
    // previous block height — otherwise the shrink padding would add extra
    // rows on top of the padding below.
    this._blockRows = 0
    // Re-pin the block to the bottom after the screen was cleared.
    this._padToBottom()
    this._writeBlock()
  }

  // Repaint ONLY the input rows, leaving the status/spinner block untouched.
  // Used for buffer/cursor changes (typing, arrows, backspace, …): the status
  // line has its OWN animation timer, and repainting it on every keystroke
  // made the whole block blink on terminals like Tabby. When nothing is drawn
  // yet (rendered === false) fall back to a full render so the very first
  // paint is correct.
  _renderInputOnly() {
    if (!this.rendered) {
      this._render()
      return
    }
    const cols = process.stdout.columns || 80
    const lay = layoutInput(this.promptStr, this.buf, this.cursor, cols)
    const sugg = this._suggestions()
    const shown = sugg.slice(0, 8)
    this._suggestCount = shown.length
    const linesBelow = shown.length
      ? shown.length + (sugg.length > shown.length ? 1 : 0)
      : 0
    // Move up to the INPUT top using the OLD cursor row (on screen right now).
    this._eraseInputOnly(this.cursorRowFromTop - this._statusTop)
    let out = lay.rows.map((r) => r.prefix + r.text).join(NL)
    if (shown.length) {
      const maxName = Math.max(...shown.map((c) => c.name.length))
      const lines = shown.map((c) => {
        const name = theme.prompt(c.name.padEnd(maxName))
        const desc = theme.dim('  ' + c.description)
        return '   ' + name + desc
      })
      out += NL + lines.join(NL)
      const hidden = sugg.length - shown.length
      if (hidden > 0)
        out +=
          NL +
          theme.dim(
            '   ' + translate(this.locale)('editor.more', { n: hidden }),
          )
    }
    // A buffer change can UNWRAP the input (backspace on a wrapped line), so
    // the block can get shorter here too — push it back to the bottom BEFORE
    // the new content is printed (the padding is plain newlines at the top of
    // the block, which scroll the screen).
    const blockRows = this._statusTop + lay.rows.length + linesBelow
    this._padShrink(blockRows, this._blockRows)
    this._blockRows = blockRows
    process.stdout.write(out)
    const up = lay.rows.length - 1 - lay.cursorRow + linesBelow
    if (up > 0) process.stdout.write(ESC + '[' + up + 'A')
    process.stdout.write(CR)
    if (lay.cursorCol > 0) process.stdout.write(ESC + '[' + lay.cursorCol + 'C')
    this.rendered = true
    this.cursorRowFromTop = this._statusTop + lay.cursorRow
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
    return renderDots(n)
  }

  // Status-line hint ("Esc — stop"), localized. Shown for every animated
  // state: Esc really aborts both a generation and a running tool (the Bash
  // child is killed via AbortSignal), so the promise is accurate.
  _hint(): string {
    return theme.dim('  ·  ' + translate(this.locale)('spinner.hint'))
  }

  // The lifecycle phase prefix for the status line, colored by meaning:
  // generating (brown) and settled (green check) both get a prefix, so the
  // transition from "still generating" to "answer done" is visible; 'paused'
  // has none (the base status itself reads "пауза Ns"). Returns '' when no
  // phase is active, so an idle status is not prefixed.
  _stateLabel(): string {
    if (this._sendState === 'generating')
      return (
        theme.brown(translate(this.locale)('state.generating')) + theme.dim(':')
      )
    if (this._sendState === 'settled')
      return (
        theme.success(translate(this.locale)('state.settled')) + theme.dim(':')
      )
    return ''
  }

  // Called by the browser layer at real lifecycle points: right before a
  // send (generating), during a throttle/Continue pause (paused), and after
  // the answer settled (settled). Any other value clears the phase.
  setSendState(state: string): void {
    const next =
      state === 'generating' || state === 'paused' || state === 'settled'
        ? state
        : ''
    if (next === this._sendState) return
    this._sendState = next
    this._render()
  }

  _startThinking() {
    if (this.pendingText) {
      this.setStatus(theme.prompt('✎ ') + this.pendingText + this._hint())
      return
    }
    this._startAnimated(randomThinkingPhrase(this.locale))
  }

  // Animated status: a brown base text plus a growing "running" dot sequence.
  // Shared by the thinking spinner and the send-pause indicator, so the pause
  // is animated too (previously the pause was a static console line and the
  // dots stayed frozen).
  _startAnimated(baseText: string) {
    this._thinkBase = theme.brown(stripEllipsis(baseText))
    this._dotPhase = 0
    // Remember when the animation began so the status can show how long the
    // current phase has been running ("12s"): a long reasoning turn otherwise
    // looks identical to a hung one.
    this._animStart = Date.now()
    this.setStatus(
      this._thinkBase + this._dots(0) + this._elapsedLabel() + this._hint(),
    )
    this._stopDots()
    this._dotTimer = setInterval(() => {
      this._dotPhase = (this._dotPhase + 1) % DOTS.length
      this.setStatus(
        this._thinkBase +
          this._dots(this._dotPhase) +
          this._elapsedLabel() +
          this._hint(),
      )
    }, 400)
    this._animating = true
    if (this._dotTimer.unref) this._dotTimer.unref()
  }

  // Elapsed seconds of the current animated phase, formatted for the status
  // line ("0s", "45s", "2m 05s"). Empty while nothing is animating.
  _elapsedLabel(): string {
    if (!this._animating || !this._animStart) return ''
    const sec = Math.floor((Date.now() - this._animStart) / 1000)
    const m = Math.floor(sec / 60)
    const s = sec % 60
    const text = m > 0 ? m + 'm ' + String(s).padStart(2, '0') + 's' : s + 's'
    return theme.dim(' · ' + text)
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
      // Keep the SAME tail as the dot timer renders (elapsed + hint). Omitting
      // the elapsed label here made it blink once per second: the timer showed
      // "· 1m 50s" and the per-second sendPause update erased it.
      this.setStatus(
        this._thinkBase +
          this._dots(this._dotPhase) +
          this._elapsedLabel() +
          this._hint(),
      )
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
    // A finished send must not keep prefixing the NEXT status (e.g. a tool
    // that starts right after the answer) with a stale "settled"/"generating".
    this._sendState = ''
    this.setStatus('')
  }

  toolCall(name: string, args: unknown): void {
    const full = safeJson(args)
    // Clip by VISIBLE WIDTH, not character count: a long arg line used to print
    // wider than the terminal and some terminals then showed a horizontal
    // scrollbar. Keep one column free (autowrap safety), same as the status.
    const maxW = contentWidth()
    const preview = truncateToWidth(full, maxW)
    this.printAbove(theme.tool('🔧 ' + name) + ' ' + theme.dim(preview))
    // A tool may run for a long time (Bash, npm test, MCP). Without an active
    // animation the operator sees a frozen screen and cannot tell work is in
    // progress. Start the animated status AFTER printAbove (which stops the
    // dots) and keep it running until toolResult()/assistant()/stop(). Esc now
    // really aborts the tool (the Bash child process is killed via the
    // AbortSignal), so the "Esc — стоп" hint is shown.
    //
    // The tool status is NOT a send phase: clear the lifecycle prefix first,
    // otherwise the previous answer's "✓ done" sticks and the status reads
    // "✓ done: running Bash" on one line.
    this._sendState = ''
    this._startAnimated(
      translate(this.locale)('spinner.running_tool', { name }),
    )
  }

  toolResult(result: unknown): void {
    this.stop()
    const text = typeof result === 'string' ? result : safeJson(result)
    const maxW = contentWidth()
    const preview = truncateToWidth(text.split(NL).join(' ↵ '), maxW)
    this.printAbove(theme.toolResult('   → ' + preview))
  }

  assistant(msg: string): void {
    this.stop()
    const rendered = renderMarkdown(msg)
    // The used context is NOT repeated under the answer: `_writeBlock` keeps
    // showing it right-aligned in the status line even after `stop()` clears
    // the spinner text (the `else if (ctxText)` branch), so printing it here
    // again was a duplicate of the same `accumulated_token_usage` number.
    this.printAbove(
      NL +
        theme.assistant(translate(this.locale)('editor.answer')) +
        NL +
        rendered +
        NL +
        theme.dim(divider()),
    )
  }

  // Warning to the operator (e.g. the agent stopped suspiciously).
  // Printed above the input line without overwriting it.
  warning(msg: string): void {
    // Wrap long service messages (send failures, rate limits) to the same
    // margin the tool previews use, instead of letting the terminal wrap them
    // at the full width and mid-word — that mismatch looked ragged.
    const maxW = contentWidth()
    const wrapped = wrapToWidth('⚠ ' + msg, maxW)
    this.printAbove(NL + theme.warn(wrapped))
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
    // Fallback for terminals that do NOT send a bracketed paste: if the WHOLE
    // input is a path to an existing image/file, attach it and send the marker
    // instead of the raw path. Without this the operator pasted a path, saw
    // plain text, and no [image#N] marker appeared.
    if (this.onAttach && !this.attachments.items.length) {
      const t = display.trim()
      const quoted =
        (t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'"))
      // Only treat the input as a path when it is a SINGLE token (no spaces)
      // that looks like a file name — so a normal sentence containing a dot is
      // never swallowed as an attachment.
      const singleToken = !/\s/.test(t)
      const looksPath =
        singleToken && /[./\\]/.test(t) && /\.[a-z0-9]{1,6}$/i.test(t)
      if (looksPath || (quoted && /[./\\]/.test(t))) {
        void this._attachOnSubmit(display)
        return
      }
    }
    this._doSubmit(display)
  }

  // Try to attach a whole-input path, then submit the marker (or the raw text
  // when the attachment fails).
  async _attachOnSubmit(display: string): Promise<void> {
    if (this.onAttach) {
      try {
        const att = await this.onAttach(display.trim())
        if (att) {
          this.buf = att.marker
          this.cursor = Array.from(this.buf).length
          this._render()
          this._doSubmit(att.marker)
          return
        }
      } catch {}
    }
    this._doSubmit(display)
  }

  _doSubmit(display: string) {
    // The input line shows compact markers "[Pasted lines#N]" instead of large
    // pastes — expand them back into the original text before sending.
    const text = expandPastes(this.pastes, display)
    // Add to history only non-empty messages that don't duplicate the previous one.
    if (text.trim() && this.history[this.history.length - 1] !== text) {
      this.history.push(text)
      // Persist the new entry: the in-memory history dies with the process.
      if (this.onHistoryChange) this.onHistoryChange(this.history.slice())
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
    this.printAbove(theme.user('❯ ') + wrapToWidth(display, contentWidth()))
    this.pastes = []
    this.attachments.reset()
    if (this.onSubmit) this.onSubmit(text, attached)
    // When a message is queued DURING a running task (`busy`), keep the
    // "agent is working" indicator alive: `_stopDots()` above cleared the
    // status, and nothing would restart it until the next send/tool — so the
    // operator saw the spinner vanish and could not tell whether the agent
    // was still working. Restart the animated status unless we are idle.
    if (this.busy) this._startThinking()
  }

  // Record the current buffer for Ctrl+_ undo. `coalesce` keeps one snapshot
  // for a whole run of plain typing (so undo removes the run, not one char) —
  // the run ends as soon as a non-typing key is handled.
  _pushUndo(coalesce = false): void {
    if (coalesce && this._typingRun) return
    this._undoStack.push({ buf: this.buf, cursor: this.cursor })
    if (this._undoStack.length > 200) this._undoStack.shift()
    this._typingRun = coalesce
  }

  // Ctrl+_ — restore the buffer to before the last edit.
  _undoEdit(): void {
    const prev = this._undoStack.pop()
    if (!prev) return
    this.buf = prev.buf
    this.cursor = Math.min(prev.cursor, Array.from(prev.buf).length)
    this._typingRun = false
  }

  _insert(text: string): void {
    const chars = Array.from(this.buf)
    const ins = Array.from(String(text))
    const next = chars
      .slice(0, this.cursor)
      .concat(ins, chars.slice(this.cursor))
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
      const text = String(raw)
        .split(CR + NL)
        .join(NL)
        .split(CR)
        .join(NL)
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

  // Bare ESC: wait a moment for a possible control-sequence tail before firing
  // onEscape. Without this a sequence split across two reads (ESC, then "[A")
  // looked like a lone Escape and aborted the current generation (N29).
  _scheduleEscape() {
    this._escPending = true
    if (this._escTimer) clearTimeout(this._escTimer)
    this._escTimer = setTimeout(() => {
      this._escTimer = null
      if (!this._escPending) return
      this._escPending = false
      if (this.onEscape) this.onEscape()
    }, ESC_DISAMBIGUATE_MS)
    if (this._escTimer.unref) this._escTimer.unref()
  }

  // Move the cursor `delta` visual rows (not logical lines) and land in the
  // column closest to the current one. A long line wraps over several visual
  // rows; the old _up/_down moved by LOGICAL lines only, so on a wrapped row
  // Up did nothing and Down skipped a whole logical line. The column is
  // measured in COLUMNS (layoutInput's cursorCol), so wide chars/emoji land on
  // the right cell. Returns false when the target row is off the buffer.
  _visualMoveRows(delta: number): boolean {
    const cols = process.stdout.columns || 80
    const lay = layoutInput(this.promptStr, this.buf, this.cursor, cols)
    const target = lay.cursorRow + delta
    if (target < 0 || target >= lay.rows.length) return false
    const row = lay.rows[target]
    const rowChars = Array.from(row.text)
    const promptW = visLen(row.prefix)
    const want = Math.max(0, lay.cursorCol - promptW)
    let idx = row.start
    let w = 0
    while (idx < row.start + rowChars.length && w < want) {
      w += charWidth(rowChars[idx - row.start].codePointAt(0) as number)
      idx++
    }
    this.cursor = idx
    return true
  }

  _up() {
    this._visualMoveRows(-1)
  }

  _down() {
    this._visualMoveRows(1)
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

  // Delete the word on the RIGHT (Ctrl+Delete / Alt+Delete): skip spaces after
  // the cursor, then delete up to the end of the next word. Mirror of
  // _deleteWordLeft(), which handles the left side.
  _deleteWordRight() {
    const chars = Array.from(this.buf)
    let i = this.cursor
    while (i < chars.length && /\s/.test(chars[i])) i++
    while (i < chars.length && !/\s/.test(chars[i])) i++
    chars.splice(this.cursor, i - this.cursor)
    this.buf = chars.join('')
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

  // ---------- reverse-search (Ctrl+R) ----------

  // Start an incremental reverse search, keeping the current buffer aside so
  // Esc restores it (bash behavior). An empty history leaves the editor
  // untouched.
  _searchStart() {
    if (!this.history.length) return
    this._searchMode = true
    this._searchQuery = ''
    this._searchIndex = this.history.length - 1
    this._searchSavedBuf = this.buf
    this._searchRefresh(true)
    this._searchStatus()
  }

  // Recompute the match for the current query. `resetToNewest` moves the
  // cursor back to the newest entry (used when the query changes; a repeated
  // Ctrl+R keeps scanning older entries from the current index).
  _searchRefresh(resetToNewest = false) {
    const q = this._searchQuery
    if (resetToNewest) this._searchIndex = this.history.length - 1
    for (let i = this._searchIndex; i >= 0; i--) {
      if (q === '' || this.history[i].toLowerCase().includes(q.toLowerCase())) {
        this._searchIndex = i
        return
      }
    }
    // No match from here: signal it and leave the buffer as-is.
    this._searchIndex = -1
  }

  // Show the search state in the status line. The matched entry is previewed
  // in the input line live, so Enter can accept it at once.
  _searchStatus() {
    const t = translate(this.locale)
    const q = this._searchQuery
    if (this._searchIndex >= 0) {
      // Set the matched buffer BEFORE setStatus(): setStatus renders the
      // block, so the preview must already be in the buffer.
      this.buf = this.history[this._searchIndex]
      this.cursor = Array.from(this.buf).length
      this.setStatus(t('editor.search_prompt', { q }))
    } else {
      this.setStatus(t('editor.search_fail', { q }))
    }
  }

  // One more Ctrl+R: move to the PREVIOUS (older) match.
  _searchNext() {
    if (this._searchIndex > 0) {
      const prev = this._searchIndex
      this._searchIndex = prev - 1
      this._searchRefresh(false)
      // If nothing matched above `prev`, keep the previous match.
      if (this._searchIndex < 0) this._searchIndex = prev
    }
    this._searchStatus()
  }

  // Enter: keep the matched buffer and leave search mode.
  _searchAccept() {
    this._searchMode = false
    this._searchQuery = ''
    this.setStatus('')
    this._render()
  }

  // Esc / Ctrl+C: leave search mode and restore the buffer typed before it.
  _searchCancel() {
    this._searchMode = false
    this._searchQuery = ''
    this.buf = this._searchSavedBuf
    this.cursor = Array.from(this.buf).length
    this.setStatus('')
    this._render()
  }

  // A character typed during search extends the query; Backspace trims it.
  _searchInput(ch: string) {
    this._searchQuery += ch
    this._searchRefresh(true)
    this._searchStatus()
  }

  _searchBackspace() {
    if (!this._searchQuery.length) return
    this._searchQuery = this._searchQuery.slice(0, -1)
    this._searchRefresh(true)
    this._searchStatus()
  }

  _handle(data: Buffer): void {
    let s = data.toString('utf-8')

    // While locked (a long operation is running), swallow all input except
    // Ctrl+C / Ctrl+D — so the user can still abort, but cannot type a message
    // that would be queued and sent after the operation.
    if (this.locked) {
      if (s.length === 1) {
        const c = s.charCodeAt(0)
        if (c === 3) {
          if (this.onCtrlC) this.onCtrlC()
          return
        }
        if (c === 4) {
          if (this.onCtrlC) this.onCtrlC()
          return
        }
      }
      return
    }

    // A previous read ended on a bare ESC. That is ambiguous: the Escape key
    // or the head of a control sequence split across reads (arrows, Ctrl+Del).
    // Reattach the ESC and parse the whole sequence, so a split arrow does not
    // abort the generation (N29).
    if (this._escPending) {
      this._escPending = false
      if (this._escTimer) {
        clearTimeout(this._escTimer)
        this._escTimer = null
      }
      s = ESC + s
    }

    if (!this._inPaste && s === ESC && !this._searchMode) {
      // Bare ESC in its own chunk: wait a moment for the possible tail of a
      // control sequence before treating it as the Escape key.
      this._scheduleEscape()
      return
    }

    // While the reverse search (Ctrl+R) is active, the editor is in a modal
    // state: every printable key extends the query, Ctrl+R scans older
    // entries, Enter accepts and Esc/Ctrl+C cancels. Handling this BEFORE the
    // normal key dispatch keeps the search self-contained.
    if (this._searchMode) {
      let i = 0
      while (i < s.length) {
        const code = s.charCodeAt(i)
        if (code === 18) {
          this._searchNext()
        } else if (code === 13 || code === 10) {
          this._searchAccept()
          return
        } else if (code === 27 || code === 3) {
          this._searchCancel()
          return
        } else if (code === 127 || code === 8) {
          this._searchBackspace()
        } else if (code >= 32) {
          this._searchInput(s[i])
        }
        i++
      }
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
        this._renderInputOnly()
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
          this._renderInputOnly()
        }
        continue
      }

      // Shift+Enter, Ctrl+Enter in terminals with the extended protocol
      // and Alt+Enter — insert a newline.
      if (s.startsWith(ESC + '[13;2u')) {
        this._insertNewline()
        s = s.slice(7)
        this._renderInputOnly()
        continue
      }
      if (s.startsWith(ESC + '[13;5u')) {
        this._insertNewline()
        s = s.slice(7)
        this._renderInputOnly()
        continue
      }
      if (s.startsWith(ESC + '[27;2;13~')) {
        this._insertNewline()
        s = s.slice(10)
        this._renderInputOnly()
        continue
      }
      if (s.startsWith(ESC + '[27;5;13~')) {
        this._insertNewline()
        s = s.slice(10)
        this._renderInputOnly()
        continue
      }
      if (s.startsWith(ESC + NL)) {
        this._insertNewline()
        s = s.slice(2)
        this._renderInputOnly()
        continue
      }

      const ch = s[0]
      const code = s.charCodeAt(0)
      s = s.slice(1)

      // Enter: if the previous character is «\», Claude-Code style: remove
      // the «\» and break the line; otherwise send the message.
      // Ctrl+J (code 10) always inserts a newline; Ctrl+Enter
      // (ESC[13;5u) and Shift+Enter too.
      if (ch === CR) {
        const before =
          this.cursor > 0 ? Array.from(this.buf)[this.cursor - 1] : ''
        if (before === '\\') {
          this._insertNewline()
          this._renderInputOnly()
          continue
        }
        this._submit()
        continue
      }
      if (code === 10) {
        this._insertNewline()
        this._renderInputOnly()
        continue
      }
      if (code === 3) {
        if (this.onCtrlC) this.onCtrlC()
        continue
      }
      if (code === 4) {
        if (!this.buf && this.onCtrlC) this.onCtrlC()
        continue
      }
      if (code === 1) {
        this._home()
        this._renderInputOnly()
        continue
      }
      if (code === 5) {
        this._end()
        this._renderInputOnly()
        continue
      }
      if (code === 9) {
        this._completeCommand()
        this._renderInputOnly()
        continue
      }
      if (code === 21) {
        this._pushUndo()
        this.buf = ''
        this.cursor = 0
        this.pastes = []
        this._renderInputOnly()
        continue
      }
      if (code === 31) {
        // Ctrl+_ — undo the last edit in the input line.
        this._undoEdit()
        this._renderInputOnly()
        continue
      }
      if (code === 22) {
        // Ctrl+V: terminals rarely deliver an image as text here, so we try the
        // OS clipboard first; if there is no image we fall back to reading the
        // text clipboard via the terminal's own paste (nothing to do).
        void this._tryClipboard()
        continue
      }
      if (code === 18) {
        // Ctrl+R — incremental reverse search over the input history.
        this._searchStart()
        continue
      }
      if (code === 14) {
        // Ctrl+N — move the suggestion highlight down (like a menu).
        this._suggestMove(1)
        continue
      }
      if (code === 16) {
        // Ctrl+P — move the suggestion highlight up.
        this._suggestMove(-1)
        continue
      }
      if (code === 23) {
        this._pushUndo()
        this._deleteWordLeft()
        this._renderInputOnly()
        continue
      }
      if (code === 11) {
        // Ctrl+K — delete from the cursor to the end of the line.
        this._pushUndo()
        const arr = Array.from(this.buf)
        let e = this.cursor
        while (e < arr.length && arr[e] !== NL) e++
        arr.splice(this.cursor, e - this.cursor)
        this.buf = arr.join('')
        this._renderInputOnly()
        continue
      }
      if (code === 12) {
        // Ctrl+L — clear the screen and repaint the input block (the standard
        // shell binding; it was silently swallowed before).
        this.clearScreen()
        continue
      }
      if (code === 127 || code === 8) {
        this._pushUndo(true)
        this._backspace()
        this._renderInputOnly()
        continue
      }

      if (code === 27) {
        // Ctrl+Left / Ctrl+Right (xterm: ESC [1;5D / ESC [1;5C;
        // some terminals: ESC [5D / ESC [5C).
        if (s.startsWith('[1;5D') || s.startsWith('[5D')) {
          this._wordLeft()
          s = s.slice(s.startsWith('[1;5D') ? 5 : 3)
          this._renderInputOnly()
          continue
        }
        if (s.startsWith('[1;5C') || s.startsWith('[5C')) {
          this._wordRight()
          s = s.slice(s.startsWith('[1;5C') ? 5 : 3)
          this._renderInputOnly()
          continue
        }
        // Ctrl+Delete / Alt+Delete — delete the word on the RIGHT. Different
        // terminals encode it differently: xterm sends ESC[3;5~, some send
        // ESC[3;3~ (Alt). Without this the sequence fell through to the
        // generic skip and nothing happened.
        if (s.startsWith('[3;5~') || s.startsWith('[3;3~')) {
          this._pushUndo()
          this._deleteWordRight()
          s = s.slice(5)
          this._renderInputOnly()
          continue
        }
        // Alt+Backspace / Ctrl+Backspace (ESC followed by DEL) — delete the
        // word on the LEFT. On many terminals Ctrl+Backspace is not a distinct
        // byte and arrives exactly like this.
        if (s.startsWith('\x7f') || s.startsWith('\x08')) {
          this._pushUndo()
          this._deleteWordLeft()
          s = s.slice(1)
          this._renderInputOnly()
          continue
        }
        // Kitty / foot / WezTerm keyboard protocol: Ctrl+Backspace is
        // CSI 127;5u (Alt = 127;3u). Without this the sequence fell through
        // to the generic skip and nothing happened.
        if (s.startsWith('[127;5u') || s.startsWith('[127;3u')) {
          this._pushUndo()
          this._deleteWordLeft()
          s = s.slice(7)
          this._renderInputOnly()
          continue
        }
        // Same CSI-u protocol for Delete: Ctrl+Delete is CSI 3;5u (Alt 3;3u),
        // plain Delete is CSI 3u — without the tilde. Missing these made the
        // key silently dead on kitty/foot/WezTerm, while the tilde forms above
        // worked (N27).
        if (s.startsWith('[3;5u') || s.startsWith('[3;3u')) {
          this._pushUndo()
          this._deleteWordRight()
          s = s.slice(5)
          this._renderInputOnly()
          continue
        }
        if (s.startsWith('[3u')) {
          this._pushUndo(true)
          this._delete()
          s = s.slice(3)
          this._renderInputOnly()
          continue
        }
        if (s.startsWith('[D')) {
          this._left()
          s = s.slice(2)
          this._renderInputOnly()
          continue
        }
        if (s.startsWith('[C')) {
          this._right()
          s = s.slice(2)
          this._renderInputOnly()
          continue
        }
        if (s.startsWith('[A')) {
          // Up: on the first visual line — history, otherwise — the line above.
          if (this._onFirstVisualLine()) this._historyUp()
          else this._up()
          s = s.slice(2)
          this._renderInputOnly()
          continue
        }
        if (s.startsWith('[B')) {
          if (this._onLastVisualLine()) this._historyDown()
          else this._down()
          s = s.slice(2)
          this._renderInputOnly()
          continue
        }
        if (s.startsWith('[H') || s.startsWith('[1~')) {
          this._home()
          s = s.slice(s.startsWith('[1~') ? 3 : 2)
          this._renderInputOnly()
          continue
        }
        if (s.startsWith('[F') || s.startsWith('[4~')) {
          this._end()
          s = s.slice(s.startsWith('[4~') ? 3 : 2)
          this._renderInputOnly()
          continue
        }
        // PageUp / PageDown (ESC[5~ / ESC[6~) — page the slash-command
        // suggestion list, which is otherwise only reachable with Ctrl+N/P.
        // Without this the sequence fell through to the generic skip.
        if (s.startsWith('[5~')) {
          this._suggestPage(-1)
          s = s.slice(3)
          continue
        }
        if (s.startsWith('[6~')) {
          this._suggestPage(1)
          s = s.slice(3)
          continue
        }
        if (s.startsWith('[3~')) {
          this._pushUndo(true)
          this._delete()
          s = s.slice(3)
          this._renderInputOnly()
          continue
        }
        // Alt+B / Alt+F — word movement.
        if (s.startsWith('b') || s.startsWith('B')) {
          this._wordLeft()
          s = s.slice(1)
          this._renderInputOnly()
          continue
        }
        if (s.startsWith('f') || s.startsWith('F')) {
          this._wordRight()
          s = s.slice(1)
          this._renderInputOnly()
          continue
        }
        let j = 0
        while (j < s.length && !/[A-Za-z~]/.test(s[j])) j++
        const skipped = s.slice(0, j + 1)
        // Surface a swallowed sequence in debug mode: an unrecognized control
        // sequence used to be skipped SILENTLY, which is how a dead key looked
        // like a frozen editor with no way to tell why.
        if (process.env.ZAMES_DEBUG_KEYS && skipped.length > 1) {
          process.stderr.write(
            String.fromCharCode(10) +
              '[keys] unhandled: ' +
              JSON.stringify(skipped) +
              String.fromCharCode(10),
          )
        }
        s = s.slice(j + 1)
        continue
      }

      if (code < 32) continue
      // Coalesce a run of typing into ONE undo snapshot.
      this._pushUndo(true)
      this._insert(ch)
      this._renderInputOnly()
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
    console.log(
      JSON.stringify({
        rows: r.rows.length,
        row: r.cursorRow,
        col: r.cursorCol,
      }),
    )
  }
}

if (
  process.argv[1] &&
  process.argv[1].endsWith('input.js') &&
  process.argv.includes('--selftest')
) {
  selftest()
}
