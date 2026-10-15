// Unit tests for the PURE editor logic of the Ink TUI (src/tui/edit.ts) and the
// key dispatcher (src/tui/keys.ts). These do not touch React or a terminal, so
// they pin the editing semantics the operator relies on (word movement,
// history, reverse search, paste markers, visual-row movement).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialEditState,
  insertText,
  insertNewline,
  insertPaste,
  backspace,
  del,
  moveLeft,
  moveRight,
  moveHome,
  moveEnd,
  wordLeft,
  wordRight,
  deleteWordLeft,
  deleteWordRight,
  killToLineEnd,
  moveVisualRows,
  pushUndo,
  undoEdit,
  historyUp,
  historyDown,
  searchStart,
  searchNext,
  searchAccept,
  searchCancel,
  searchInput,
  recordHistory,
  afterSubmit,
  type EditState,
} from '../src/tui/edit.js'
import { dispatchKey, parseCsiU } from '../src/tui/keys.js'
import type { Key } from 'ink'

function key(partial: Partial<Key>): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    ...partial,
  }
}

function withBuf(buf: string, cursor?: number): EditState {
  return {
    ...initialEditState(),
    buf,
    cursor: cursor ?? Array.from(buf).length,
  }
}

test('insertText вставляет в позицию курсора', () => {
  const s = withBuf('helo', 3)
  assert.equal(insertText(s, 'l').buf, 'hello')
})

test('backspace удаляет символ слева', () => {
  assert.equal(backspace(withBuf('abc', 2)).buf, 'ac')
  assert.equal(backspace(withBuf('abc', 0)).buf, 'abc')
})

test('delete удаляет символ справа', () => {
  assert.equal(del(withBuf('abc', 1)).buf, 'ac')
  assert.equal(del(withBuf('abc', 3)).buf, 'abc')
})

test('перемещение: left/right/home/end', () => {
  assert.equal(moveLeft(withBuf('abc', 1)).cursor, 0)
  assert.equal(moveRight(withBuf('abc', 1)).cursor, 2)
  assert.equal(moveHome(withBuf('ab\ncd', 4)).cursor, 3)
  assert.equal(moveEnd(withBuf('ab\ncd', 1)).cursor, 2)
})

test('wordLeft/wordRight по пробелам', () => {
  const s = withBuf('foo bar baz', 11)
  assert.equal(wordLeft(s).cursor, 8)
  assert.equal(wordLeft(wordLeft(s)).cursor, 4)
  assert.equal(wordRight(withBuf('foo bar baz', 0)).cursor, 3)
})

test('deleteWordLeft/deleteWordRight', () => {
  assert.equal(deleteWordLeft(withBuf('foo bar', 7)).buf, 'foo ')
  assert.equal(deleteWordRight(withBuf('foo bar', 3)).buf, 'foo')
})

test('killToLineEnd удаляет до конца логической строки', () => {
  assert.equal(killToLineEnd(withBuf('abc\ndef', 1)).buf, 'a\ndef')
})

test('insertNewline убирает хвостовой «\\»', () => {
  assert.equal(insertNewline(withBuf('abc\\', 4)).buf, 'abc\n')
  assert.equal(insertNewline(withBuf('abc', 3)).buf, 'abc\n')
})

test('moveVisualRows двигает по визуальным строкам', () => {
  // A long line that wraps at width 10 (prompt width 2 => 8 usable chars).
  const prompt = '> '
  const s = withBuf('aaaaaaaaaaaaaaaaaaaa', 20)
  const up = moveVisualRows(s, -1, prompt, 10)
  assert.ok(up.cursor < 20, 'cursor moved up a visual row')
  const down = moveVisualRows(up, 1, prompt, 10)
  assert.ok(down.cursor > up.cursor, 'cursor moved back down')
})

test('undo восстанавливает буфер', () => {
  let s = withBuf('abc')
  s = pushUndo(s)
  s = insertText(s, 'd')
  assert.equal(s.buf, 'abcd')
  s = undoEdit(s)
  assert.equal(s.buf, 'abc')
})

test('история: up/down и черновик', () => {
  let s: EditState = {
    ...initialEditState(),
    history: ['one', 'two'],
    histIndex: 2,
  }
  s = insertText(s, 'draft')
  s = historyUp(s)
  assert.equal(s.buf, 'two')
  s = historyUp(s)
  assert.equal(s.buf, 'one')
  s = historyDown(s)
  assert.equal(s.buf, 'two')
  s = historyDown(s)
  assert.equal(s.buf, 'draft')
})

test('reverse-search: набор запроса, accept, cancel', () => {
  let s: EditState = {
    ...initialEditState(),
    history: ['alpha', 'beta', 'alphabet'],
    histIndex: 3,
  }
  s = insertText(s, 'x')
  s = searchStart(s)
  assert.equal(s.searchMode, true)
  s = searchInput(s, 'al')
  assert.ok(s.buf.startsWith('al'))
  const accepted = searchAccept(s)
  assert.equal(accepted.searchMode, false)
  // A fresh search (saving the 'x' draft) cancelled must restore 'x'.
  let s2: EditState = {
    ...initialEditState(),
    history: ['alpha', 'beta', 'alphabet'],
    histIndex: 3,
  }
  s2 = insertText(s2, 'x')
  s2 = searchStart(s2)
  s2 = searchInput(s2, 'be')
  const cancelled = searchCancel(s2)
  assert.equal(cancelled.buf, 'x')
})

test('searchNext двигается к более старому совпадению', () => {
  let s: EditState = {
    ...initialEditState(),
    history: ['a1', 'a2', 'a3'],
    histIndex: 3,
  }
  s = searchStart(s)
  s = searchInput(s, 'a')
  const first = s.searchIndex
  s = searchNext(s)
  assert.ok(s.searchIndex < first)
})

test('recordHistory + afterSubmit', () => {
  let s = withBuf('hello')
  s = recordHistory(s, 'hello')
  assert.deepEqual(s.history, ['hello'])
  s = afterSubmit(s)
  assert.equal(s.buf, '')
  assert.equal(s.cursor, 0)
})

test('insertPaste схлопывает большой паст в маркер', () => {
  const big = 'l1\nl2\nl3\nl4'
  const s = insertPaste(withBuf(''), big)
  assert.equal(s.pastes.length, 1)
  assert.equal(s.buf, s.pastes[0].marker)
})

test('dispatchKey: печатаемый символ -> insert', () => {
  const a = dispatchKey(
    'a',
    key({}),
    { searchMode: false, bufferEmpty: false, endsWithBackslash: false },
    { atTop: true, atBottom: true },
  )
  assert.deepEqual(a, { type: 'insert', text: 'a' })
})

test('dispatchKey: Ctrl+W -> deleteWordLeft, Ctrl+K -> killToEnd', () => {
  assert.equal(
    dispatchKey(
      'w',
      key({ ctrl: true }),
      { searchMode: false, bufferEmpty: false, endsWithBackslash: false },
      { atTop: true, atBottom: true },
    )?.type,
    'deleteWordLeft',
  )
  assert.equal(
    dispatchKey(
      'k',
      key({ ctrl: true }),
      { searchMode: false, bufferEmpty: false, endsWithBackslash: false },
      { atTop: true, atBottom: true },
    )?.type,
    'killToEnd',
  )
})

test('dispatchKey: Enter -> submit, Tab -> complete', () => {
  assert.equal(
    dispatchKey(
      '',
      key({ return: true }),
      { searchMode: false, bufferEmpty: false, endsWithBackslash: false },
      { atTop: true, atBottom: true },
    )?.type,
    'submit',
  )
  assert.equal(
    dispatchKey(
      '',
      key({ tab: true }),
      { searchMode: false, bufferEmpty: false, endsWithBackslash: false },
      { atTop: true, atBottom: true },
    )?.type,
    'complete',
  )
})

test('dispatchKey: Up на верхнем крае -> historyPrev, внутри -> up', () => {
  assert.equal(
    dispatchKey(
      '',
      key({ upArrow: true }),
      { searchMode: false, bufferEmpty: false, endsWithBackslash: false },
      { atTop: true, atBottom: false },
    )?.type,
    'historyPrev',
  )
  assert.equal(
    dispatchKey(
      '',
      key({ upArrow: true }),
      { searchMode: false, bufferEmpty: false, endsWithBackslash: false },
      { atTop: false, atBottom: false },
    )?.type,
    'up',
  )
})

test('dispatchKey: Ctrl+D при пустом буфере -> ctrlD, иначе delete', () => {
  assert.equal(
    dispatchKey(
      'd',
      key({ ctrl: true }),
      { searchMode: false, bufferEmpty: true, endsWithBackslash: false },
      { atTop: true, atBottom: true },
    )?.type,
    'ctrlD',
  )
  assert.equal(
    dispatchKey(
      'd',
      key({ ctrl: true }),
      { searchMode: false, bufferEmpty: false, endsWithBackslash: false },
      { atTop: true, atBottom: true },
    )?.type,
    'delete',
  )
})

test('dispatchKey: в режиме поиска буквы -> searchInput', () => {
  const a = dispatchKey(
    'q',
    key({}),
    { searchMode: true, bufferEmpty: false, endsWithBackslash: false },
    { atTop: true, atBottom: true },
  )
  assert.deepEqual(a, { type: 'searchInput', text: 'q' })
})

test('dispatchKey: Alt+B/Alt+F -> wordLeft/wordRight', () => {
  assert.equal(
    dispatchKey(
      'b',
      key({ meta: true }),
      { searchMode: false, bufferEmpty: false, endsWithBackslash: false },
      { atTop: true, atBottom: true },
    )?.type,
    'wordLeft',
  )
  assert.equal(
    dispatchKey(
      'f',
      key({ meta: true }),
      { searchMode: false, bufferEmpty: false, endsWithBackslash: false },
      { atTop: true, atBottom: true },
    )?.type,
    'wordRight',
  )
})

test('dispatchKey: полный набор Ctrl-биндингов', () => {
  const ctx = {
    searchMode: false,
    bufferEmpty: false,
    endsWithBackslash: false,
  }
  const edges = { atTop: true, atBottom: true }
  const c = (ch: string): string | undefined =>
    dispatchKey(ch, key({ ctrl: true }), ctx, edges)?.type
  assert.equal(c('a'), 'home')
  assert.equal(c('e'), 'end')
  assert.equal(c('b'), 'left')
  assert.equal(c('f'), 'right')
  assert.equal(c('w'), 'deleteWordLeft')
  assert.equal(c('k'), 'killToEnd')
  assert.equal(c('u'), 'clearLine')
  assert.equal(c('l'), 'clearScreen')
  assert.equal(c('_'), 'undoEdit')
  assert.equal(c('r'), 'searchStart')
  assert.equal(c('n'), 'suggestNext')
  assert.equal(c('p'), 'suggestPrev')
  assert.equal(c('v'), 'clipboard')
  assert.equal(c('j'), 'newline')
  assert.equal(c('z'), undefined)
})

test('dispatchKey: named-ключи и края истории', () => {
  const ctx = {
    searchMode: false,
    bufferEmpty: false,
    endsWithBackslash: false,
  }
  assert.equal(
    dispatchKey('', key({ leftArrow: true }), ctx, {
      atTop: true,
      atBottom: true,
    })?.type,
    'left',
  )
  assert.equal(
    dispatchKey('', key({ rightArrow: true }), ctx, {
      atTop: true,
      atBottom: true,
    })?.type,
    'right',
  )
  assert.equal(
    dispatchKey('', key({ home: true }), ctx, { atTop: true, atBottom: true })
      ?.type,
    'home',
  )
  assert.equal(
    dispatchKey('', key({ end: true }), ctx, { atTop: true, atBottom: true })
      ?.type,
    'end',
  )
  assert.equal(
    dispatchKey('', key({ backspace: true }), ctx, {
      atTop: true,
      atBottom: true,
    })?.type,
    'backspace',
  )
  assert.equal(
    dispatchKey('', key({ delete: true }), ctx, { atTop: true, atBottom: true })
      ?.type,
    'delete',
  )
  assert.equal(
    dispatchKey('', key({ escape: true }), ctx, { atTop: true, atBottom: true })
      ?.type,
    'escape',
  )
  assert.equal(
    dispatchKey('', key({ downArrow: true }), ctx, {
      atTop: false,
      atBottom: true,
    })?.type,
    'historyNext',
  )
  assert.equal(
    dispatchKey('', key({ downArrow: true }), ctx, {
      atTop: false,
      atBottom: false,
    })?.type,
    'down',
  )
})

test('dispatchKey: режим поиска — все ветки', () => {
  const ctx = { searchMode: true, bufferEmpty: false, endsWithBackslash: false }
  const edges = { atTop: true, atBottom: true }
  assert.equal(
    dispatchKey('r', key({ ctrl: true }), ctx, edges)?.type,
    'searchNext',
  )
  assert.equal(
    dispatchKey('', key({ return: true }), ctx, edges)?.type,
    'searchAccept',
  )
  assert.equal(
    dispatchKey('', key({ escape: true }), ctx, edges)?.type,
    'searchCancel',
  )
  assert.equal(
    dispatchKey('c', key({ ctrl: true }), ctx, edges)?.type,
    'searchCancel',
  )
  assert.equal(
    dispatchKey('', key({ backspace: true }), ctx, edges)?.type,
    'searchBackspace',
  )
  assert.equal(
    dispatchKey('', key({ delete: true }), ctx, edges)?.type,
    'searchBackspace',
  )
  assert.equal(dispatchKey('x', key({}), ctx, edges)?.type, 'searchInput')
})

test('dispatchKey: Alt+Backspace/Delete -> слово-удаление, пустой -> null', () => {
  const ctx = {
    searchMode: false,
    bufferEmpty: false,
    endsWithBackslash: false,
  }
  const edges = { atTop: true, atBottom: true }
  assert.equal(
    dispatchKey('', key({ meta: true, backspace: true }), ctx, edges)?.type,
    'deleteWordLeft',
  )
  assert.equal(
    dispatchKey('', key({ meta: true, delete: true }), ctx, edges)?.type,
    'deleteWordLeft',
  )
  assert.equal(dispatchKey('z', key({ meta: true }), ctx, edges), null)
  assert.equal(dispatchKey('', key({}), ctx, edges), null)
})

test('dispatchKey: Enter — submit, но Shift+Enter и «\»+Enter = перенос', () => {
  const base = {
    searchMode: false,
    bufferEmpty: false,
    endsWithBackslash: false,
  }
  const edges = { atTop: true, atBottom: true }
  // Plain Enter -> submit.
  assert.equal(
    dispatchKey('', key({ return: true }), base, edges)?.type,
    'submit',
  )
  // Shift+Enter -> newline.
  assert.equal(
    dispatchKey('', key({ return: true, shift: true }), base, edges)?.type,
    'newline',
  )
  // Trailing backslash + Enter -> newline.
  assert.equal(
    dispatchKey(
      '',
      key({ return: true }),
      { ...base, endsWithBackslash: true },
      edges,
    )?.type,
    'newline',
  )
  // Alt+Enter -> newline.
  assert.equal(
    dispatchKey('', key({ return: true, meta: true }), base, edges)?.type,
    'newline',
  )
  // Ctrl+J -> newline. The REAL byte for Ctrl+J is LF (0x0A): Ink reports
  // input='\n' with key.ctrl FALSE (it maps LF to name='enter', which the
  // public Key type hides). The old test used input='j'+ctrl=true — a shape
  // Ink never delivers — so the binding was "green" while Ctrl+J did nothing.
  assert.equal(dispatchKey('\n', key({}), base, edges)?.type, 'newline')
  // The legacy shape (ctrl+'j') must ALSO still map to newline.
  assert.equal(
    dispatchKey('j', key({ ctrl: true }), base, edges)?.type,
    'newline',
  )
  // Ctrl+Enter (kitty protocol) -> newline, NOT submit.
  assert.equal(
    dispatchKey('\r', key({ return: true, ctrl: true }), base, edges)?.type,
    'newline',
  )
})

test('deleteWordRight: at end of line falls back to deleting the word LEFT', () => {
  // The operator's terminal (VSCode) sends the standard xterm Ctrl+Delete
  // (ESC[3;5~) which maps to deleteWordRight. With the cursor at the END of
  // the line there was nothing to the right, so the key did NOTHING and the
  // operator read it as "Ctrl+Delete does not delete the word before the
  // cursor". At the end of a line it now deletes the word on the LEFT.
  const atEnd = { ...initialEditState(), buf: 'foo bar baz', cursor: 11 }
  assert.equal(deleteWordRight(atEnd).buf, 'foo bar ')
  // Mid-line it still deletes the word on the RIGHT (standard behaviour).
  const mid = { ...initialEditState(), buf: 'foo bar baz', cursor: 4 }
  assert.equal(deleteWordRight(mid).buf, 'foo  baz')
  // Only whitespace to the newline: also delete left, do not eat the newline.
  const NLc = String.fromCharCode(10)
  const beforeNl = { ...initialEditState(), buf: 'foo bar' + NLc, cursor: 7 }
  assert.equal(deleteWordRight(beforeNl).buf, 'foo ' + NLc)
})

test('dispatchKey: Ctrl+Delete deletes the word on the LEFT', () => {
  // The operator's binding: Ctrl+Del removes the word BEFORE the cursor
  // (like Ctrl+Backspace). Plain Delete still removes one char to the right.
  const ctx = {
    searchMode: false,
    bufferEmpty: false,
    endsWithBackslash: false,
  }
  const edges = { atTop: true, atBottom: true }
  assert.equal(
    dispatchKey('', key({ ctrl: true, delete: true }), ctx, edges)?.type,
    'deleteWordLeft',
  )
  assert.equal(
    dispatchKey('', key({ delete: true }), ctx, edges)?.type,
    'delete',
  )
  // Alt+Delete also deletes the word on the LEFT.
  assert.equal(
    dispatchKey('', key({ meta: true, delete: true }), ctx, edges)?.type,
    'deleteWordLeft',
  )
})

test('parseCsiU: kitty Ctrl+Delete deletes the word on the LEFT', () => {
  const ESC = String.fromCharCode(27)
  assert.equal(parseCsiU(ESC + '[3;5u')?.type, 'deleteWordLeft')
  // Plain kitty Delete still deletes one char.
  assert.equal(parseCsiU(ESC + '[3u')?.type, 'delete')
})

test('dispatchKey: ESC d (VSCode Ctrl+Delete) deletes the word LEFT', () => {
  // VSCode's terminal sends Ctrl+Delete as `ESC d`, which Ink reports as
  // meta+d (name='d', input='d'). The operator expects it to delete the word
  // BEFORE the cursor — without this branch it fell through and did nothing.
  const ctx = {
    searchMode: false,
    bufferEmpty: false,
    endsWithBackslash: false,
  }
  const edges = { atTop: true, atBottom: true }
  assert.equal(
    dispatchKey('d', key({ meta: true }), ctx, edges)?.type,
    'deleteWordLeft',
  )
})
