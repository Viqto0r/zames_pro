// A small VT100/ANSI terminal emulator for tests and dev probes.
//
// It replays the escape sequences Ink actually emits (cursor moves, erase,
// scroll, alternate screen) into a character grid, so a pty run can be
// asserted on the REAL final screen instead of grepping raw bytes. Codes the
// editor/app does not use are ignored (colors, title, kitty protocol, mouse
// reporting) — that is fine, they do not move the cursor or paint cells.
//
// `.mts` so both `test/*.test.ts` (via tsx) and `scripts/*.mts` can import it.

export const ESC = String.fromCharCode(27)
const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const BS = String.fromCharCode(8)

export class Term {
  rows: number
  cols: number
  grid: string[][]
  r = 0
  c = 0
  /** Saved cursor (DECSC/DECRC and CSI s/u). */
  private saved = { r: 0, c: 0 }

  constructor(rows: number, cols: number) {
    this.rows = rows
    this.cols = cols
    this.grid = Array.from({ length: rows }, () => new Array(cols).fill(' '))
  }

  scrollUp(): void {
    this.grid.shift()
    this.grid.push(new Array(this.cols).fill(' '))
    this.r = this.rows - 1
  }

  newline(): void {
    this.r++
    if (this.r >= this.rows) this.scrollUp()
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
        const next = s[i]
        if (next === '[') {
          i++
          let params = ''
          while (i < s.length && /[0-9;?><!]/.test(s[i])) {
            params += s[i]
            i++
          }
          const cmd = s[i]
          i++
          this.csi(params, cmd)
          continue
        }
        if (next === ']') {
          // OSC ... BEL / ST — ignore the payload.
          i++
          while (i < s.length && s[i] !== '\u0007' && s[i] !== ESC) i++
          if (s[i] === ESC) i++
          if (s[i] === '\\') i++
          continue
        }
        if (next === '(' || next === ')') {
          i += 2
          continue
        }
        // Single-char escapes: DECSC (7) / DECRC (8) / RIS (c).
        if (next === '7') this.saved = { r: this.r, c: this.c }
        else if (next === '8') {
          this.r = this.saved.r
          this.c = this.saved.c
        } else if (next === 'c') {
          this.grid = Array.from({ length: this.rows }, () =>
            new Array(this.cols).fill(' '),
          )
          this.r = 0
          this.c = 0
        }
        i++
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
      if (ch === BS) {
        this.c = Math.max(0, this.c - 1)
        i++
        continue
      }
      if (ch === '\u0007') {
        i++
        continue
      }
      this.put(ch)
      i++
    }
  }

  csi(params: string, cmd: string): void {
    const nums = params
      .replace(/^[?><!]+/, '')
      .split(';')
      .map((p) => (p === '' ? NaN : parseInt(p, 10)))
    const n1 = Number.isFinite(nums[0]) ? nums[0] : 1
    const n0 = Number.isFinite(nums[0]) ? nums[0] : 0
    const isPrivate = /^[?]/.test(params)
    switch (cmd) {
      case 'A':
        this.r = Math.max(0, this.r - n1)
        break
      case 'B':
        this.r = Math.min(this.rows - 1, this.r + n1)
        break
      case 'C':
        this.c = Math.min(this.cols - 1, this.c + n1)
        break
      case 'D':
        this.c = Math.max(0, this.c - n1)
        break
      case 'E':
        this.r = Math.min(this.rows - 1, this.r + n1)
        this.c = 0
        break
      case 'F':
        this.r = Math.max(0, this.r - n1)
        this.c = 0
        break
      case 'G':
        this.c = Math.max(0, Math.min(this.cols - 1, n1 - 1))
        break
      case 'd':
        this.r = Math.max(0, Math.min(this.rows - 1, n1 - 1))
        break
      case 'H':
      case 'f': {
        const row = Number.isFinite(nums[0]) ? nums[0] : 1
        const col = Number.isFinite(nums[1]) ? nums[1] : 1
        this.r = Math.max(0, Math.min(this.rows - 1, row - 1))
        this.c = Math.max(0, Math.min(this.cols - 1, col - 1))
        break
      }
      case 'J':
        this.eraseDisplay(n0)
        break
      case 'K':
        this.eraseLine(n0)
        break
      case 'L':
        for (let k = 0; k < n1; k++) this.grid.splice(this.r, 0, new Array(this.cols).fill(' '))
        this.grid.length = this.rows
        break
      case 'M':
        for (let k = 0; k < n1; k++) {
          this.grid.splice(this.r, 1)
          this.grid.push(new Array(this.cols).fill(' '))
        }
        break
      case 's':
        this.saved = { r: this.r, c: this.c }
        break
      case 'u':
        if (!isPrivate) {
          this.r = this.saved.r
          this.c = this.saved.c
        }
        break
      default:
        break
    }
  }

  private eraseDisplay(mode: number): void {
    if (mode === 2) {
      this.grid = Array.from({ length: this.rows }, () =>
        new Array(this.cols).fill(' '),
      )
      return
    }
    if (mode === 0) {
      for (let cc = this.c; cc < this.cols; cc++) this.grid[this.r][cc] = ' '
      for (let rr = this.r + 1; rr < this.rows; rr++)
        for (let cc = 0; cc < this.cols; cc++) this.grid[rr][cc] = ' '
    } else if (mode === 1) {
      for (let rr = 0; rr < this.r; rr++)
        for (let cc = 0; cc < this.cols; cc++) this.grid[rr][cc] = ' '
      for (let cc = 0; cc <= this.c && cc < this.cols; cc++)
        this.grid[this.r][cc] = ' '
    }
  }

  private eraseLine(mode: number): void {
    if (mode === 2) {
      for (let cc = 0; cc < this.cols; cc++) this.grid[this.r][cc] = ' '
    } else if (mode === 0) {
      for (let cc = this.c; cc < this.cols; cc++) this.grid[this.r][cc] = ' '
    } else if (mode === 1) {
      for (let cc = 0; cc <= this.c && cc < this.cols; cc++)
        this.grid[this.r][cc] = ' '
    }
  }

  lineText(r: number): string {
    return this.grid[r].join('').replace(/\s+$/, '')
  }

  render(): string {
    return this.grid.map((row) => row.join('').replace(/\s+$/, '')).join(NL)
  }

  findRow(sub: string): number {
    for (let i = 0; i < this.rows; i++) if (this.lineText(i).includes(sub)) return i
    return -1
  }
}
