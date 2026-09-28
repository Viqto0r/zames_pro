import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// On terminals like Tabby a full erase+rewrite of the whole block on every
// keystroke made the screen blink. The editor now skips re-printing the status
// line when it did not change: typing only redraws the input rows, so the
// status block is never erased. These tests pin that behavior.

const ESC = String.fromCharCode(27)
const ERASE = String.fromCharCode(13) + ESC + '[J'

function withCapture(fn: (e: LineEditor, writes: string[]) => void): string[] {
  const e = new LineEditor()
  const writes: string[] = []
  const orig = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: (s: string) => boolean }).write = (
    s: string,
  ) => {
    writes.push(String(s))
    return true
  }
  try {
    fn(e, writes)
  } finally {
    ;(process.stdout as unknown as { write: typeof orig }).write = orig
  }
  return writes
}

test('typing a char does not erase the status block', () => {
  const writes = withCapture((e, w) => {
    e.statusText = 'STATUS'
    e._writeBlock() // full render: status + input
    w.length = 0
    e.buf = 'a'
    e.cursor = 1
    e._writeBlock() // status unchanged -> input-only redraw
  })
  const joined = writes.join('')
  assert.ok(joined.includes('a'), 'the input must be redrawn')
  assert.ok(
    !joined.includes('STATUS'),
    'the status must NOT be reprinted while typing',
  )
})

test('a changed status does reprint (no stale cache)', () => {
  const writes = withCapture((e, w) => {
    e.statusText = 'ONE'
    e._writeBlock()
    w.length = 0
    e.statusText = 'TWO'
    e._render()
  })
  const joined = writes.join('')
  assert.ok(joined.includes(ERASE), 'a full erase must happen')
  assert.ok(joined.includes('TWO'), 'the new status must be printed')
})

test('printAbove repaints the status and keeps the cache consistent', () => {
  const writes = withCapture((e, w) => {
    e.statusText = 'STATUS'
    e._writeBlock()
    w.length = 0
    e.printAbove('hello')
    // printAbove erases the whole block and repaints it (status included), so
    // the status MUST be present in this very output.
    assert.ok(
      w.join('').includes('STATUS'),
      'status must be repainted by printAbove',
    )
    w.length = 0
    // The next render with an unchanged status must NOT reprint it again.
    e.buf = 'x'
    e.cursor = 1
    e._writeBlock()
    assert.ok(
      !w.join('').includes('STATUS'),
      'status must not be reprinted after printAbove when unchanged',
    )
  })
})
