// PURE input-editing logic for the Ink TUI — the state transitions of the
// input line, extracted from the old LineEditor so they are unit-testable
// without a terminal.
//
// The editor state is a plain object (buffer, cursor, history, pastes, ...).
// Each action returns a NEW state (or the same object when nothing changed), so
// the React layer can `setState` cheaply. Terminal I/O, rendering and timers
// live in the component; everything here is a pure function of (state, action).

import {
  layoutInput,
  pasteReplacement,
  visLen,
  charWidth,
  NL,
  type PasteBlock,
} from '../input/layout.js'

/** Re-exported so callers can reuse the same collapse logic. */
export type { PasteBlock }

/** The full editable state of the input line. */
export interface EditState {
  /** The visible buffer text (markers, not the collapsed paste bodies). */
  buf: string
  /** Cursor position in CODE POINTS within `buf`. */
  cursor: number
  /** Collapsed paste blocks (marker <-> original text). */
  pastes: PasteBlock[]
  /** Sent-message history (up/down arrows, Ctrl+R). */
  history: string[]
  /** Current position in `history` (== length means "draft", not browsing). */
  histIndex: number
  /** The draft saved when history browsing started. */
  histDraft: string
  /** Reverse-search (Ctrl+R) mode is active. */
  searchMode: boolean
  /** Current reverse-search query. */
  searchQuery: string
  /** Index of the current match in `history`, or -1 when none. */
  searchIndex: number
  /** Buffer saved before reverse search, restored on Esc. */
  searchSavedBuf: string
  /**
   * Undo stack of {buf, cursor, pastes} snapshots (Ctrl+_). The paste BLOCKS
   * are part of a snapshot: without them an undo of a cleared line restored
   * the bare `[Pasted lines#N]` marker while its body was gone, and the submit
   * sent the literal marker instead of the pasted text.
   */
  undo: Array<{ buf: string; cursor: number; pastes: PasteBlock[] }>
  /** True while a run of plain typing is in progress (one undo snapshot). */
  typingRun: boolean
}

export function initialEditState(): EditState {
  return {
    buf: '',
    cursor: 0,
    pastes: [],
    history: [],
    histIndex: 0,
    histDraft: '',
    searchMode: false,
    searchQuery: '',
    searchIndex: -1,
    searchSavedBuf: '',
    undo: [],
    typingRun: false,
  }
}

/** Chars (code points) of the buffer. */
function charsOf(s: EditState): string[] {
  return Array.from(s.buf)
}

/** Insert a string at the cursor. */
export function insertText(s: EditState, text: string): EditState {
  const chars = charsOf(s)
  const ins = Array.from(String(text))
  const next = chars.slice(0, s.cursor).concat(ins, chars.slice(s.cursor))
  return { ...s, buf: next.join(''), cursor: s.cursor + ins.length }
}

/** Push an undo snapshot. `coalesce` keeps one snapshot per typing run. */
export function pushUndo(s: EditState, coalesce = false): EditState {
  if (coalesce && s.typingRun) return s
  const undo = s.undo.concat({
    buf: s.buf,
    cursor: s.cursor,
    pastes: s.pastes,
  })
  if (undo.length > 200) undo.shift()
  return { ...s, undo, typingRun: coalesce }
}

export function undoEdit(s: EditState): EditState {
  if (!s.undo.length) return s
  const undo = s.undo.slice(0, -1)
  const prev = s.undo[s.undo.length - 1]
  return {
    ...s,
    buf: prev.buf,
    cursor: Math.min(prev.cursor, Array.from(prev.buf).length),
    pastes: prev.pastes,
    undo,
    typingRun: false,
  }
}

export function backspace(s: EditState): EditState {
  if (s.cursor <= 0) return s
  const chars = charsOf(s)
  chars.splice(s.cursor - 1, 1)
  return { ...s, buf: chars.join(''), cursor: s.cursor - 1 }
}

export function del(s: EditState): EditState {
  const chars = charsOf(s)
  if (s.cursor >= chars.length) return s
  chars.splice(s.cursor, 1)
  return { ...s, buf: chars.join('') }
}

/** Delete the word on the LEFT of the cursor (Ctrl+W / Alt+Backspace). */
export function deleteWordLeft(s: EditState): EditState {
  const chars = charsOf(s)
  let i = s.cursor
  // A NEWLINE is a hard boundary: at the start of a line the key does
  // nothing instead of eating the break and the previous line's word
  // (deleteWordRight and wordLeft already stop at a newline).
  while (i > 0 && chars[i - 1] !== NL && /\s/.test(chars[i - 1])) i--
  while (i > 0 && chars[i - 1] !== NL && !/\s/.test(chars[i - 1])) i--
  chars.splice(i, s.cursor - i)
  return { ...s, buf: chars.join(''), cursor: i }
}

/**
 * Delete the word on the RIGHT of the cursor (Ctrl+Delete / Alt+Delete):
 * skip the whitespace after the cursor, then delete up to the end of the next
 * word — the mirror of deleteWordLeft(). At the end of the line there is
 * nothing to the right, so the buffer is left UNCHANGED (never a surprise
 * leftward delete), matching the legacy LineEditor's _deleteWordRight().
 */
export function deleteWordRight(s: EditState): EditState {
  const chars = charsOf(s)
  // Stop at a NEWLINE: it is whitespace for /\s/ but must never be swallowed
  // by a word delete (the old code guarded this; without the guard the key
  // ate the line break).
  let i = s.cursor
  while (i < chars.length && chars[i] !== NL && /\s/.test(chars[i])) i++
  while (i < chars.length && chars[i] !== NL && !/\s/.test(chars[i])) i++
  if (i === s.cursor) return s
  chars.splice(s.cursor, i - s.cursor)
  return { ...s, buf: chars.join(''), cursor: s.cursor }
}

/** Delete from the cursor to the end of the current LOGICAL line (Ctrl+K). */
export function killToLineEnd(s: EditState): EditState {
  const arr = charsOf(s)
  let e = s.cursor
  while (e < arr.length && arr[e] !== NL) e++
  arr.splice(s.cursor, e - s.cursor)
  return { ...s, buf: arr.join('') }
}

export function moveLeft(s: EditState): EditState {
  return s.cursor > 0 ? { ...s, cursor: s.cursor - 1 } : s
}

export function moveRight(s: EditState): EditState {
  return s.cursor < Array.from(s.buf).length
    ? { ...s, cursor: s.cursor + 1 }
    : s
}

export function moveHome(s: EditState): EditState {
  const chars = charsOf(s)
  let i = s.cursor
  while (i > 0 && chars[i - 1] !== NL) i--
  return i === s.cursor ? s : { ...s, cursor: i }
}

export function moveEnd(s: EditState): EditState {
  const chars = charsOf(s)
  let i = s.cursor
  while (i < chars.length && chars[i] !== NL) i++
  return i === s.cursor ? s : { ...s, cursor: i }
}

export function wordLeft(s: EditState): EditState {
  const chars = charsOf(s)
  let i = s.cursor
  // Stop at a newline (mirrors deleteWordLeft/deleteWordRight): the cursor
  // must not jump to the previous LINE, only to the previous word.
  while (i > 0 && chars[i - 1] !== NL && /\s/.test(chars[i - 1])) i--
  while (i > 0 && chars[i - 1] !== NL && !/\s/.test(chars[i - 1])) i--
  return i === s.cursor ? s : { ...s, cursor: i }
}

export function wordRight(s: EditState): EditState {
  const chars = charsOf(s)
  let i = s.cursor
  // Stop at a NEWLINE, like wordLeft/deleteWordLeft/deleteWordRight do: the
  // caret must never jump ACROSS a line break. Without the guard, Alt+F at the
  // end of a line skipped the break and landed at the end of the NEXT line.
  while (i < chars.length && chars[i] !== NL && /\s/.test(chars[i])) i++
  while (i < chars.length && chars[i] !== NL && !/\s/.test(chars[i])) i++
  return i === s.cursor ? s : { ...s, cursor: i }
}

/**
 * Move the cursor `delta` VISUAL rows (wrapping-aware) and land in the column
 * closest to the current one. Returns the same object when the target row is
 * off the buffer (so Up/Down fall back to history).
 */
export function moveVisualRows(
  s: EditState,
  delta: number,
  promptStr: string,
  cols: number,
): EditState {
  const lay = layoutInput(promptStr, s.buf, s.cursor, cols)
  const target = lay.cursorRow + delta
  if (target < 0 || target >= lay.rows.length) return s
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
  return { ...s, cursor: idx }
}

/** Insert a newline; a trailing «\» before the cursor is removed first. */
export function insertNewline(s: EditState): EditState {
  const chars = charsOf(s)
  if (s.cursor > 0 && chars[s.cursor - 1] === '\\') {
    chars.splice(s.cursor - 1, 1)
    const s2 = { ...s, buf: chars.join(''), cursor: s.cursor - 1 }
    return insertText(s2, NL)
  }
  return insertText(s, NL)
}

/** Insert a pasted block: small pastes as-is, large ones as a marker. */
export function insertPaste(s: EditState, raw: string): EditState {
  const rep = pasteReplacement(raw)
  if (!rep) {
    const text = String(raw).split('\r\n').join(NL).split('\r').join(NL)
    return insertText(s, text)
  }
  return { ...insertText(s, rep.marker), pastes: s.pastes.concat(rep) }
}

// ---------- history ----------

export function historyUp(s: EditState): EditState {
  if (!s.history.length) return s
  let histIndex = s.histIndex
  let histDraft = s.histDraft
  if (histIndex === s.history.length) histDraft = s.buf
  if (histIndex > 0) {
    histIndex--
    const buf = s.history[histIndex]
    return {
      ...s,
      histIndex,
      histDraft,
      buf,
      cursor: Array.from(buf).length,
    }
  }
  return { ...s, histDraft }
}

export function historyDown(s: EditState): EditState {
  if (!s.history.length) return s
  let histIndex = s.histIndex
  let buf: string
  if (histIndex < s.history.length - 1) {
    histIndex++
    buf = s.history[histIndex]
  } else {
    histIndex = s.history.length
    buf = s.histDraft
  }
  return { ...s, histIndex, buf, cursor: Array.from(buf).length }
}

export function searchStart(s: EditState): EditState {
  if (!s.history.length) return s
  const st: EditState = {
    ...s,
    searchMode: true,
    searchQuery: '',
    searchIndex: s.history.length - 1,
    searchSavedBuf: s.buf,
  }
  return searchRefresh(st, true)
}

export function searchRefresh(s: EditState, resetToNewest: boolean): EditState {
  const q = s.searchQuery
  const index = resetToNewest ? s.history.length - 1 : s.searchIndex
  for (let i = index; i >= 0; i--) {
    if (q === '' || s.history[i].toLowerCase().includes(q.toLowerCase())) {
      const buf = s.history[i]
      return {
        ...s,
        searchIndex: i,
        buf,
        cursor: Array.from(buf).length,
      }
    }
  }
  return { ...s, searchIndex: -1 }
}

export function searchNext(s: EditState): EditState {
  if (s.searchIndex > 0) {
    const prev = s.searchIndex
    const st = searchRefresh({ ...s, searchIndex: prev - 1 }, false)
    if (st.searchIndex < 0) return { ...st, searchIndex: prev }
    return st
  }
  return s
}

export function searchAccept(s: EditState): EditState {
  return { ...s, searchMode: false, searchQuery: '' }
}

export function searchCancel(s: EditState): EditState {
  return {
    ...s,
    searchMode: false,
    searchQuery: '',
    buf: s.searchSavedBuf,
    cursor: Array.from(s.searchSavedBuf).length,
  }
}

export function searchInput(s: EditState, ch: string): EditState {
  return searchRefresh({ ...s, searchQuery: s.searchQuery + ch }, true)
}

export function searchBackspace(s: EditState): EditState {
  if (!s.searchQuery.length) return s
  return searchRefresh({ ...s, searchQuery: s.searchQuery.slice(0, -1) }, true)
}

/** Record a submitted message in the history (dedup the last one). */
export function recordHistory(s: EditState, text: string): EditState {
  if (!text.trim() || s.history[s.history.length - 1] === text) {
    return { ...s, histIndex: s.history.length, histDraft: '' }
  }
  const history = s.history.concat(text)
  return { ...s, history, histIndex: history.length, histDraft: '' }
}

/** Reset the buffer after a submit (keeps history/pastes cleared). */
export function afterSubmit(s: EditState): EditState {
  return {
    ...s,
    buf: '',
    cursor: 0,
    pastes: [],
    histIndex: s.history.length,
    histDraft: '',
  }
}
