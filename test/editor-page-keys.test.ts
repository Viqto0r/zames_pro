import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// N30: Ctrl+L (clear) and PageUp/PageDown were silently swallowed. Ctrl+L now
// clears the screen; PageUp/PageDown page the suggestion list.

const ESC = String.fromCharCode(27)

function makeEditor(): LineEditor {
  const e = new LineEditor()
  e._render = () => {}
  e._renderInputOnly = () => {}
  e.printAbove = () => {}
  return e
}

test('Ctrl+L clears the screen (and does not insert a char)', () => {
  const e = makeEditor()
  let cleared = 0
  e.clearScreen = () => {
    cleared++
  }
  e.buf = 'abc'
  e.cursor = 3
  e._handle(Buffer.from(String.fromCharCode(12)))
  assert.equal(cleared, 1)
  assert.equal(e.buf, 'abc')
})

test('PageDown / PageUp page the suggestion list', () => {
  const e = makeEditor()
  e.slashCommands = Array.from({ length: 20 }, (_, i) => ({
    name: '/cmd' + i,
    description: 'd',
  }))
  e.buf = '/'
  e.cursor = 1
  e._handle(Buffer.from(ESC + '[6~'))
  assert.ok(e._suggestSelected >= 0, 'a page down selects an entry')
  const afterDown = e._suggestSelected
  e._handle(Buffer.from(ESC + '[5~'))
  assert.ok(e._suggestSelected <= afterDown)
})

test('PageUp/PageDown are a no-op without an open suggestion list', () => {
  const e = makeEditor()
  e.buf = 'hello'
  e.cursor = 5
  e._handle(Buffer.from(ESC + '[6~'))
  e._handle(Buffer.from(ESC + '[5~'))
  assert.equal(e.buf, 'hello')
  assert.equal(e._suggestSelected, -1)
})
