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

export interface KeyContext {
  /** Reverse-search (Ctrl+R) mode is active. */
  searchMode: boolean
  /** The buffer is empty (Ctrl+D exits only then). */
  bufferEmpty: boolean
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
    // Ctrl + a NAMED key (arrows, Delete, Backspace) arrives with an EMPTY
    // `input` and the named flag set. These are the word-movement bindings:
    // Ctrl+Left/Right move by word, Ctrl+Delete/Backspace delete a word.
    // They MUST be checked before the `switch (input)` below, whose `default:
    // return null` used to swallow them silently (Ctrl+arrows did nothing).
    if (key.leftArrow) return { type: 'wordLeft' }
    if (key.rightArrow) return { type: 'wordRight' }
    if (key.delete) return { type: 'deleteWordRight' }
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
      case 'j':
        return { type: 'newline' }
      default:
        return null
    }
  }

  // ---- Alt / Meta combos (word movement) ----
  if (key.meta) {
    if (input === 'b') return { type: 'wordLeft' }
    if (input === 'f') return { type: 'wordRight' }
    if (key.backspace) return { type: 'deleteWordLeft' }
    if (key.delete) return { type: 'deleteWordRight' }
    return null
  }

  // ---- named keys ----
  if (key.return) return { type: 'submit' }
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
