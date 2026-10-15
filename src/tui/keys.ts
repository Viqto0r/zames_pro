// PURE key dispatch: turn an Ink (input, key) pair into an editor action.
//
// Ink normalizes terminal escape sequences into `input` + a `Key` object
// (ctrl/meta/shift/arrows/…), so this module does NOT need the raw CSI parsing
// the old LineEditor had. It maps the normalized keys to the same bindings the
// operator is used to (Ctrl+W, Ctrl+K, Ctrl+U, Ctrl+_, word movement, history,
// reverse search, Tab completion, Alt+B/F).
//
// Kept free of React/Ink runtime imports beyond the Key TYPE, so it is
// unit-testable.

import type { Key } from 'ink'

const LF = String.fromCharCode(10)

/**
 * Ctrl/Alt + named keys under the KITTY keyboard protocol (CSI-u). Ink's
 * `parseKeypress` recognizes the MODIFIED ARROW forms but returns `name=''`
 * for the modified Delete/Backspace codepoints (CSI 3;5u, 127;5u, ...), so
 * `useInput` yields an empty input/name and the binding never fires — the
 * operator's "Ctrl+Delete does nothing". The legacy LineEditor parsed these
 * bytes itself; the TUI reads them from raw stdin (Ink hides `sequence`) and
 * maps the known ones to the SAME actions so both editors behave alike.
 *
 * Returns null when the string is not one of these sequences. Pure + exported
 * for tests.
 */
export function parseCsiU(raw: string): EditorAction | null {
  // CSI codepoint ; modifier [: eventType] u — e.g. ESC[3;5u (Ctrl+Delete),
  // ESC[127;5u (Ctrl+Backspace), ESC[3u (plain Delete),
  // ESC[127u (plain Backspace), ESC[13;5u (Ctrl+Enter).
  const m = /^\u001b\[(\d+)(?:;(\d+))?(?::\d+)?u$/.exec(raw)
  if (!m) return null
  const cp = Number(m[1])
  const mod = m[2] ? Number(m[2]) - 1 : 0
  const ctrl = (mod & 4) !== 0
  const alt = (mod & 2) !== 0
  if (cp === 13 && (ctrl || alt)) return { type: 'newline' }
  if (cp === 3) {
    // Ctrl/Alt+Delete deletes the word on the LEFT (see dispatchKey).
    return ctrl || alt ? { type: 'deleteWordLeft' } : { type: 'delete' }
  }
  if (cp === 127) {
    return ctrl || alt ? { type: 'deleteWordLeft' } : { type: 'backspace' }
  }
  return null
}

/** The semantic action a keypress maps to. `null` = ignore. */
export type EditorAction =
  | { type: 'submit' }
  | { type: 'newline' }
  | { type: 'insert'; text: string }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'wordLeft' }
  | { type: 'wordRight' }
  | { type: 'deleteWordLeft' }
  | { type: 'deleteWordRight' }
  | { type: 'killToEnd' }
  | { type: 'clearLine' }
  | { type: 'undoEdit' }
  | { type: 'complete' }
  | { type: 'suggestNext' }
  | { type: 'suggestPrev' }
  | { type: 'historyPrev' }
  | { type: 'historyNext' }
  | { type: 'searchStart' }
  | { type: 'searchNext' }
  | { type: 'searchAccept' }
  | { type: 'searchCancel' }
  | { type: 'searchInput'; text: string }
  | { type: 'searchBackspace' }
  | { type: 'escape' }
  | { type: 'ctrlC' }
  | { type: 'ctrlD' }
  | { type: 'clearScreen' }
  | { type: 'clipboard' }
  | { type: 'copyCode' }

export interface KeyContext {
  /** Reverse-search (Ctrl+R) mode is active. */
  searchMode: boolean
  /** The buffer is empty (Ctrl+D exits only then). */
  bufferEmpty: boolean
  /**
   * True when the character just LEFT of the cursor is a backslash: Enter then
   * inserts a newline (line continuation) and drops the backslash.
   */
  endsWithBackslash: boolean
}

/**
 * Map a normalized Ink keypress to an editor action.
 *
 * `isVisualEdge` reports whether the cursor is on the first/last VISUAL line so
 * Up/Down act as history only at the edges (inside a multiline input they move
 * by visual rows). The component computes it from the live layout and passes it
 * in, keeping this function pure.
 */
export function dispatchKey(
  input: string,
  key: Key,
  ctx: KeyContext,
  isVisualEdge: { atTop: boolean; atBottom: boolean },
): EditorAction | null {
  // ---- reverse search modal state ----
  if (ctx.searchMode) {
    if (key.ctrl && input === 'r') return { type: 'searchNext' }
    if (key.return) return { type: 'searchAccept' }
    if (key.escape) return { type: 'searchCancel' }
    if (key.ctrl && input === 'c') return { type: 'searchCancel' }
    if (key.backspace || key.delete) return { type: 'searchBackspace' }
    if (input && input >= ' ' && !key.ctrl && !key.meta) {
      return { type: 'searchInput', text: input }
    }
    return null
  }

  // ---- control combos ----
  if (key.ctrl) {
    // Ctrl+Enter (kitty protocol only) inserts a newline. Ink reports it as
    // return=true + ctrl=true, so it must be checked BEFORE the plain-return
    // branch below (which would otherwise SUBMIT).
    if (key.return) return { type: 'newline' }
    // Ctrl + a NAMED key (arrows, Delete, Backspace) arrives with an EMPTY
    // `input` and the named flag set. These are the word-movement bindings:
    // Ctrl+Left/Right move by word, Ctrl+Delete/Backspace delete a word.
    // They MUST be checked before the `switch (input)` below, whose `default:
    // return null` used to swallow them silently (Ctrl+arrows did nothing).
    if (key.leftArrow) return { type: 'wordLeft' }
    if (key.rightArrow) return { type: 'wordRight' }
    // Ctrl+Delete deletes the word BEFORE the cursor (the operator's binding:
    // "Ctrl+Del must delete the word before the cursor"). Ctrl+Backspace does
    // the same. Plain Delete still deletes one char to the RIGHT.
    if (key.delete) return { type: 'deleteWordLeft' }
    if (key.backspace) return { type: 'deleteWordLeft' }
    if (key.home) return { type: 'home' }
    if (key.end) return { type: 'end' }
    switch (input) {
      case 'c':
        return { type: 'ctrlC' }
      case 'd':
        return ctx.bufferEmpty ? { type: 'ctrlD' } : { type: 'delete' }
      case 'a':
        return { type: 'home' }
      case 'e':
        return { type: 'end' }
      case 'b':
        return { type: 'left' }
      case 'f':
        return { type: 'right' }
      case 'w':
        return { type: 'deleteWordLeft' }
      case 'k':
        return { type: 'killToEnd' }
      case 'u':
        return { type: 'clearLine' }
      case 'l':
        return { type: 'clearScreen' }
      case '_':
        return { type: 'undoEdit' }
      case 'r':
        return { type: 'searchStart' }
      case 'n':
        return { type: 'suggestNext' }
      case 'p':
        return { type: 'suggestPrev' }
      case 'v':
        return { type: 'clipboard' }
      case 'y':
        return { type: 'copyCode' }
      case 'j':
        return { type: 'newline' }
      default:
        return null
    }
  }

  // ---- Alt / Meta combos (word movement + Alt+Enter newline) ----
  if (key.meta) {
    // Alt+Enter inserts a newline (send without submitting).
    if (key.return) return { type: 'newline' }
    if (input === 'b') return { type: 'wordLeft' }
    if (input === 'f') return { type: 'wordRight' }
    // VSCode sends Ctrl+Delete as `ESC d` (which Ink reports as Alt+d).
    // The operator expects it to delete the word BEFORE the cursor.
    if (input === 'd') return { type: 'deleteWordLeft' }
    if (key.backspace) return { type: 'deleteWordLeft' }
    if (key.delete) return { type: 'deleteWordRight' }
    return null
  }

  // ---- LF as a bare newline (Ctrl+J) ----
  // Ctrl+J sends LF (0x0A). Ink maps LF to `name='enter'` — which the public
  // `Key` type does NOT expose — and leaves `key.ctrl` FALSE, so the ctrl
  // branch above never fires. Without this guard LF fell through every branch
  // (`input >= ' '` is false for 0x0A) and Ctrl+J did NOTHING. Treat a lone
  // LF as a newline; a plain Enter (CR) still submits below.
  if (input === LF) return { type: 'newline' }

  // ---- named keys ----
  // Enter inserts a NEWLINE (not submit) when Shift+Enter is pressed, when a
  // trailing backslash precedes the cursor (line continuation), or via
  // Alt+Enter / Ctrl+J above. A PLAIN Enter submits.
  if (key.return) {
    if (key.shift) return { type: 'newline' }
    if (ctx.endsWithBackslash) return { type: 'newline' }
    return { type: 'submit' }
  }
  if (key.tab) return { type: 'complete' }
  if (key.backspace) return { type: 'backspace' }
  if (key.delete) return { type: 'delete' }
  if (key.leftArrow) return { type: 'left' }
  if (key.rightArrow) return { type: 'right' }
  if (key.upArrow) {
    return isVisualEdge.atTop ? { type: 'historyPrev' } : { type: 'up' }
  }
  if (key.downArrow) {
    return isVisualEdge.atBottom ? { type: 'historyNext' } : { type: 'down' }
  }
  if (key.home) return { type: 'home' }
  if (key.end) return { type: 'end' }
  if (key.escape) return { type: 'escape' }

  // ---- printable text ----
  if (input && input >= ' ') {
    return { type: 'insert', text: input }
  }
  return null
}
