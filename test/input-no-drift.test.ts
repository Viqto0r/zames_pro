import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// The input line must NOT drift up the screen while the user types and deletes
// characters. The bug: the input-only repaint (`_renderInputOnly`, and the
// incremental branch of `_writeBlock`) moved the cursor up by the INPUT'S
// HEIGHT instead of by the cursor's OWN row within the input. Whenever the
// cursor was not on the last visual line the erase started one or more rows too
// high, ate the row above the input, and redrew the block higher each keypress.
// The cursor row within the input is `cursorRowFromTop - _statusTop`.

const ESC = String.fromCharCode(27)

function captureWithSize(
  rows: number,
  cols: number,
  fn: (e: LineEditor) => void,
): string {
  const e = new LineEditor()
  const writes: string[] = []
  const orig = process.stdout.write.bind(process.stdout)
  const origRows = process.stdout.rows
  const origCols = process.stdout.columns
  Object.defineProperty(process.stdout, 'rows', {
    value: rows,
    configurable: true,
  })
  Object.defineProperty(process.stdout, 'columns', {
    value: cols,
    configurable: true,
  })
  ;(process.stdout as unknown as { write: (s: string) => boolean }).write = (
    s: string,
  ) => {
    writes.push(String(s))
    return true
  }
  try {
    fn(e)
  } finally {
    ;(process.stdout as unknown as { write: typeof orig }).write = orig
    Object.defineProperty(process.stdout, 'rows', {
      value: origRows,
      configurable: true,
    })
    Object.defineProperty(process.stdout, 'columns', {
      value: origCols,
      configurable: true,
    })
  }
  return writes.join('')
}

function firstUpMove(s: string): number {
  const m = s.match(new RegExp(ESC + '\\[(\\d+)A'))
  return m ? Number(m[1]) : 0
}

test('_eraseInputOnly moves up by the cursor row within the input', () => {
  const out = captureWithSize(24, 80, (e) => {
    e.rendered = true
    e.cursorRowFromTop = 2
    e._statusTop = 0
    e._renderInputOnly()
  })
  assert.equal(firstUpMove(out), 2, JSON.stringify(out))
})

test('_eraseInputOnly ignores the status rows above the input', () => {
  const out = captureWithSize(24, 80, (e) => {
    e.rendered = true
    e.cursorRowFromTop = 2
    e._statusTop = 1
    e._renderInputOnly()
  })
  assert.equal(firstUpMove(out), 1, JSON.stringify(out))
})

test('_eraseInputOnly does not move for a single-line input', () => {
  const out = captureWithSize(24, 80, (e) => {
    e.rendered = true
    e.cursorRowFromTop = 0
    e._statusTop = 0
    e._renderInputOnly()
  })
  assert.equal(firstUpMove(out), 0, JSON.stringify(out))
})
