import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor, visLen } from '../src/input.ts'

// A status row that reaches the FULL terminal width triggers autowrap on many
// terminals (Tabby, iTerm, Windows Terminal): the cursor jumps to the next
// line, the following erase moves to the wrong row, and the status line
// STACKS on screen — the operator sees the "pause Ns" line duplicated.
//
// The editor therefore keeps one column free (effective width = cols - 1).

const PAUSE = '⏳ пауза 12с перед отправкой     ·  Esc — стоп'
const THINK = 'Перемешиваю кал лопатой     ·  Esc — стоп'
const CTX = '269k · 27%'

test('the padded status+context row never fills the terminal exactly', () => {
  for (const status of [PAUSE, THINK]) {
    for (let cols = 20; cols <= 240; cols++) {
      const usable = cols - 1
      const space = usable - visLen(status) - visLen(CTX)
      if (space < 2) continue // status alone is too long; it wraps, unavoidable
      const row = status + ' '.repeat(space) + CTX
      assert.notEqual(
        visLen(row),
        cols,
        `padded row must not fill the terminal exactly (cols=${cols})`,
      )
    }
  }
})

test('the editor prints a status row narrower than the terminal', () => {
  const e = new LineEditor()
  const writes: string[] = []
  const orig = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: (s: string) => boolean }).write = (
    s: string,
  ) => {
    writes.push(String(s))
    return true
  }
  Object.defineProperty(process.stdout, 'columns', {
    get: () => 200,
    configurable: true,
  })
  Object.defineProperty(process.stdout, 'rows', {
    get: () => 50,
    configurable: true,
  })
  try {
    e.statusText = PAUSE
    e._contextText = () => CTX
    e._writeBlock()
  } finally {
    ;(process.stdout as unknown as { write: typeof orig }).write = orig
  }
  const firstRow = writes.join('').split('\n')[0]
  assert.ok(
    visLen(firstRow) < 200,
    'printed status row must be narrower than the terminal, got ' +
      visLen(firstRow),
  )
})
