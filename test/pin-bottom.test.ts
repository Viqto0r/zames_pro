import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// The input line should be pinned to the BOTTOM of the terminal from the very
// start, so output grows upward above it instead of the input sitting at the
// top and descending. We fill the viewport with empty lines at start and after
// a clearScreen().

function capture(fn: () => void): string {
  const writes: string[] = []
  const orig = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: (s: string) => boolean }).write = (
    s: string,
  ) => {
    writes.push(String(s))
    return true
  }
  try {
    fn()
  } finally {
    ;(process.stdout as unknown as { write: typeof orig }).write = orig
  }
  return writes.join('')
}

function withRows(n: number, fn: () => void): void {
  const orig = process.stdout.rows
  Object.defineProperty(process.stdout, 'rows', {
    value: n,
    configurable: true,
  })
  try {
    fn()
  } finally {
    Object.defineProperty(process.stdout, 'rows', {
      value: orig,
      configurable: true,
    })
  }
}

test('_padToBottom emits rows-1 newlines', () => {
  const e = new LineEditor()
  withRows(5, () => {
    const out = capture(() =>
      (e as unknown as { _padToBottom: () => void })._padToBottom(),
    )
    assert.equal(out, '\n\n\n\n', '4 newlines for 5 rows')
  })
})

test('clearScreen re-pins the block to the bottom', () => {
  const e = new LineEditor()
  withRows(4, () => {
    const out = capture(() => e.clearScreen())
    assert.ok(out.includes('\u001b[2J'))
    assert.ok(out.includes('\n\n\n'), 'padding before the block')
  })
})
