import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor, layoutInput, visLen } from '../src/input.ts'

// A tiny terminal emulator so we can assert the ROW of the input line on a
// real screen model instead of eyeballing escape sequences. Handles exactly
// the codes the editor emits (newline + scroll, CR, CSI cursor moves, CSI
// erase) and ignores colors/private modes.

const ESC = String.fromCharCode(27)
const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)

class Term {
  rows: number
  cols: number
  grid: string[][]
  r = 0
  c = 0
  constructor(rows: number, cols: number) {
    this.rows = rows
    this.cols = cols
    this.grid = []
    for (let i = 0; i < rows; i++) this.grid.push(new Array(cols).fill(' '))
  }
  scroll(): void {
    this.grid.shift()
    this.grid.push(new Array(this.cols).fill(' '))
    this.r = this.rows - 1
  }
  newline(): void {
    this.r++
    if (this.r >= this.rows) this.scroll()
    this.c = 0
  }
  put(ch: string): void {
    if (this.c >= this.cols) {
      this.c = 0
      this.newline()
    }
    this.grid[this.r][this.c] = ch
    this.c++
  }
  write(s: string): void {
    let i = 0
    while (i < s.length) {
      const ch = s[i]
      if (ch === ESC) {
        i++
        if (s[i] === '[') {
          i++
          let num = ''
          while (i < s.length && /[0-9;?]/.test(s[i])) {
            num += s[i]
            i++
          }
          const cmd = s[i]
          i++
          this.csi(num, cmd)
        }
        continue
      }
      if (ch === NL) {
        this.newline()
        i++
        continue
      }
      if (ch === CR) {
        this.c = 0
        i++
        continue
      }
      this.put(ch)
      i++
    }
  }
  csi(num: string, cmd: string): void {
    const n = num.startsWith('?') ? 0 : num === '' ? 1 : parseInt(num, 10)
    if (cmd === 'A') this.r = Math.max(0, this.r - n)
    else if (cmd === 'B') this.r = Math.min(this.rows - 1, this.r + n)
    else if (cmd === 'C') this.c = Math.min(this.cols - 1, this.c + n)
    else if (cmd === 'D') this.c = Math.max(0, this.c - n)
    else if (cmd === 'J') {
      if (num === '2') {
        for (let rr = 0; rr < this.rows; rr++)
          for (let cc = 0; cc < this.cols; cc++) this.grid[rr][cc] = ' '
        return
      }
      for (let cc = this.c; cc < this.cols; cc++) this.grid[this.r][cc] = ' '
      for (let rr = this.r + 1; rr < this.rows; rr++)
        for (let cc = 0; cc < this.cols; cc++) this.grid[rr][cc] = ' '
    } else if (cmd === 'K') {
      for (let cc = this.c; cc < this.cols; cc++) this.grid[this.r][cc] = ' '
    } else if (cmd === 'H') {
      this.r = 0
      this.c = 0
    }
  }
  lineText(r: number): string {
    return this.grid[r].join('').trimEnd()
  }
  findRow(sub: string): number {
    for (let i = 0; i < this.rows; i++)
      if (this.lineText(i).includes(sub)) return i
    return -1
  }
}

function setup(rows: number, cols: number) {
  const term = new Term(rows, cols)
  const e = new LineEditor()
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
    term.write(String(s))
    return true
  }
  const restore = (): void => {
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
  return { term, e, restore }
}

function boot(e: LineEditor): void {
  ;(e as unknown as { _padToBottom: () => void })._padToBottom()
  e._writeBlock()
}

test('drift: typing + arrows must not move the input line (empty chat)', () => {
  const { term, e, restore } = setup(24, 80)
  try {
    boot(e)
    const before = term.findRow('>')
    for (const ch of 'hello world') e._handle(Buffer.from(ch, 'utf8'))
    for (let k = 0; k < 15; k++) e._handle(Buffer.from(ESC + '[D'))
    for (let k = 0; k < 15; k++) e._handle(Buffer.from(ESC + '[C'))
    const after = term.findRow('>')
    assert.equal(before, 23, 'starts on the bottom row')
    assert.equal(after, before, 'input row must stay put')
  } finally {
    restore()
  }
})

test('drift: wrapped input + arrows keep the input line in place', () => {
  const { term, e, restore } = setup(24, 40)
  try {
    // A context status line above the input, as in a real chat.
    e.contextStatus = 'ctx: 12k · 1%'
    boot(e)
    const bottom = term.rows - 1
    for (const ch of 'x'.repeat(90)) e._handle(Buffer.from(ch, 'utf8'))
    // When the input wraps, the terminal scrolls so the input stays pinned to
    // the BOTTOM; the cursor must remain on the last screen row.
    assert.equal(term.r, bottom, 'cursor must stay on the bottom row')
    for (let k = 0; k < 90; k++) e._handle(Buffer.from(ESC + '[D'))
    for (let k = 0; k < 90; k++) e._handle(Buffer.from(ESC + '[C'))
    assert.equal(term.r, bottom, 'arrows must not move the input line')
  } finally {
    restore()
  }
})

test('layoutInput reserves the last column (autowrap safety)', () => {
  // A row that reaches exactly `cols` columns triggers autowrap / a pending
  // wrap on real terminals, which makes the editor's row count disagree with
  // the screen and the input line climb. Every printed row must stay strictly
  // narrower than the terminal.
  for (let cols = 21; cols <= 120; cols++) {
    for (const buf of ['x'.repeat(500), 'word '.repeat(200)]) {
      const r = layoutInput('> ', buf, buf.length, cols)
      for (const row of r.rows) {
        assert.ok(
          visLen(row.prefix + row.text) < cols,
          `row must be narrower than ${cols}`,
        )
      }
    }
  }
})

test('drift: many backspaces must not move the input line', () => {
  const { term, e, restore } = setup(24, 80)
  try {
    boot(e)
    const before = term.findRow('>')
    for (const ch of 'abcdefghij') e._handle(Buffer.from(ch, 'utf8'))
    for (let k = 0; k < 10; k++) e._handle(Buffer.from([127]))
    const after = term.findRow('>')
    assert.equal(after, before, 'backspace must not move the input line')
  } finally {
    restore()
  }
})

function bottomNonEmpty(term: Term): number {
  for (let i = term.rows - 1; i >= 0; i--) {
    if (term.lineText(i).length) return i
  }
  return -1
}

// The whole footer (status line with the pause/context + the input line) must
// stay glued to the BOTTOM of the terminal: output printed above it pushes it
// up only by scrolling, never leaves it floating with blank rows below.
test('footer stays pinned to the bottom while output streams', () => {
  const { term, e, restore } = setup(24, 60)
  try {
    e.statusText = 'pause 12s'
    e.contextStatus = 'ctx: 269k · 27%'
    ;(e as unknown as { _padToBottom: () => void })._padToBottom()
    e._writeBlock()
    for (let n = 0; n < 30; n++) {
      e.printAbove('line ' + n + ' ' + 'y'.repeat(50))
      assert.equal(bottomNonEmpty(term), 23, 'footer pinned after printAbove')
      assert.equal(term.findRow('ctx:'), 22, 'context row above the input')
      assert.equal(term.findRow('>'), 23, 'input row on the bottom')
    }
  } finally {
    restore()
  }
})

// When the block SHRINKS (the pause status disappears, the input unwraps) the
// shorter footer must be pushed back down to the bottom instead of floating.
test('footer does not float when the block shrinks', () => {
  const { term, e, restore } = setup(24, 60)
  try {
    // A wrapped input + a status row.
    e.statusText = 'generating an answer'
    ;(e as unknown as { _padToBottom: () => void })._padToBottom()
    e._writeBlock()
    for (const ch of 'word '.repeat(12)) e._handle(Buffer.from(ch, 'utf8'))
    assert.equal(bottomNonEmpty(term), 23, 'bottom before shrink')
    // The status disappears -> the block loses its top row.
    e.statusText = ''
    e.refreshStatus()
    assert.equal(bottomNonEmpty(term), 23, 'footer floats after status gone')
    // The input unwraps -> another row is freed.
    for (let k = 0; k < 40; k++) e._handle(Buffer.from([127]))
    assert.equal(bottomNonEmpty(term), 23, 'footer floats after unwrap')
  } finally {
    restore()
  }
})
