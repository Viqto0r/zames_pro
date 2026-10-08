import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// Regression (N28): Up/Down must move the cursor across VISUAL rows of a
// wrapped line, not only across logical lines split by NL. Before the fix a
// long single-line buffer wrapped over two rows but Up did nothing (there was
// no logical line above), so the key looked dead on a narrow terminal.

const UP = '\x1b[A'
const DOWN = '\x1b[B'

function makeEditor(): LineEditor {
  const e = new LineEditor()
  e._render = () => {}
  e._renderInputOnly = () => {}
  e.printAbove = () => {}
  return e
}

function withCols(cols: number, fn: () => void): void {
  const orig = process.stdout.columns
  Object.defineProperty(process.stdout, 'columns', {
    value: cols,
    configurable: true,
  })
  try {
    fn()
  } finally {
    Object.defineProperty(process.stdout, 'columns', {
      value: orig,
      configurable: true,
    })
  }
}

test('Up moves the cursor to the previous VISUAL row of a wrapped line', () => {
  const e = makeEditor()
  withCols(20, () => {
    // prompt '> ' (2 cols), avail = 20 - 1 - 2 = 17 cols. 40 chars -> 3 rows.
    e.buf = 'x'.repeat(40)
    e.cursor = 40 // end of the buffer (last visual row)
    e._handle(Buffer.from(UP))
    // One visual row up = 17 chars back.
    assert.equal(e.cursor, 23)
  })
})

test('Down moves the cursor to the next VISUAL row of a wrapped line', () => {
  const e = makeEditor()
  withCols(20, () => {
    e.buf = 'x'.repeat(40)
    e.cursor = 0 // first visual row
    e._handle(Buffer.from(DOWN))
    assert.equal(e.cursor, 17)
  })
})

test('Up/Down on a wrapped line keep the visual column', () => {
  const e = makeEditor()
  withCols(20, () => {
    e.buf = 'x'.repeat(40)
    e.cursor = 5 // column 3 on the first row (prompt 2 + 3)
    e._handle(Buffer.from(DOWN))
    assert.equal(e.cursor, 22) // 17 + 5 -> same visual column
  })
})

test('Up at the top visual row is a no-op without history', () => {
  const e = makeEditor()
  withCols(20, () => {
    e.buf = 'x'.repeat(40)
    e.cursor = 3
    e._handle(Buffer.from(UP))
    assert.equal(e.cursor, 3)
  })
})
