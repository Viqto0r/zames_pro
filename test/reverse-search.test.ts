import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

function makeEditor(): LineEditor {
  const e = new LineEditor()
  e._render = () => {}
  e._renderInputOnly = () => {}
  e.printAbove = () => {}
  return e
}

const CTRL_R = String.fromCharCode(18)
const ESC = String.fromCharCode(27)
const ENTER = String.fromCharCode(13)

test('ctrl-r: starts search and previews the newest match', () => {
  const e = makeEditor()
  e.history = ['first', 'second', 'third']
  e.buf = 'draft'
  e.cursor = 5
  e._handle(Buffer.from(CTRL_R))
  assert.equal(e._searchMode, true)
  assert.equal(e.buf, 'third')
})

test('ctrl-r: typing filters older entries', () => {
  const e = makeEditor()
  e.history = ['build tests', 'run tests', 'deploy']
  e._handle(Buffer.from(CTRL_R))
  e._handle(Buffer.from('run'))
  assert.equal(e.buf, 'run tests')
})

test('ctrl-r: esc restores the pre-search buffer', () => {
  const e = makeEditor()
  e.history = ['hello world']
  e.buf = 'my draft'
  e.cursor = 8
  e._handle(Buffer.from(CTRL_R))
  e._handle(Buffer.from(ESC))
  assert.equal(e._searchMode, false)
  assert.equal(e.buf, 'my draft')
})

test('ctrl-r: enter accepts the match', () => {
  const e = makeEditor()
  e.history = ['accepted line']
  e._handle(Buffer.from(CTRL_R))
  e._handle(Buffer.from(ENTER))
  assert.equal(e._searchMode, false)
  assert.equal(e.buf, 'accepted line')
})

test('ctrl-r: no match keeps buffer and reports failure', () => {
  const e = makeEditor()
  e.history = ['aaa', 'bbb']
  e.buf = 'keepme'
  e.cursor = 6
  e._handle(Buffer.from(CTRL_R))
  e._handle(Buffer.from('zzz'))
  assert.equal(e._searchIndex, -1)
  assert.equal(e.buf, 'bbb')
})
