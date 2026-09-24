import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// A tall answer printed via printAbove used to leave a stale cursor offset
// larger than the screen; _eraseBlock then moved the cursor too far and the
// erase ate the answer. The offset must be clamped to the visible height.

test('_eraseBlock clamps the up-move to the terminal height', () => {
  const ESC = String.fromCharCode(27)
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
    e.rendered = true
    e.cursorRowFromTop = 9999
    e._eraseBlock()
  } finally {
    ;(process.stdout as unknown as { write: typeof orig }).write = orig
  }
  const joined = writes.join('')
  // Find the up-move: ESC '[' <digits> 'A'
  const upToken = ESC + '['
  const start = joined.indexOf(upToken)
  assert.ok(start !== -1, 'expected an up-move: ' + JSON.stringify(joined))
  let end = start + upToken.length
  let digits = ''
  while (end < joined.length && joined[end] >= '0' && joined[end] <= '9') {
    digits += joined[end]
    end++
  }
  assert.equal(joined[end], 'A', 'expected A after the digits')
  const up = Number(digits)
  assert.ok(up > 0 && up < 9999, 'up-move must be clamped, got ' + up)
  assert.ok(joined.includes(ESC + '[J'), 'must erase from cursor to end')
})

test('printAbove stops the spinner before writing', () => {
  const e = new LineEditor()
  let stopCalled = 0
  ;(e as unknown as { _stopDots: () => void })._stopDots = () => { stopCalled++ }
  ;(e as unknown as { _eraseBlock: () => void })._eraseBlock = () => {}
  ;(e as unknown as { _writeBlock: () => void })._writeBlock = () => {}
  const orig = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: (s: string) => boolean }).write = () => true
  try {
    e.printAbove('hello')
  } finally {
    ;(process.stdout as unknown as { write: typeof orig }).write = orig
  }
  assert.equal(stopCalled, 1, 'printAbove must call _stopDots once')
})
