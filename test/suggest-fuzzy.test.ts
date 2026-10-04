import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor, isSubsequence, SUGGEST_PAGE } from '../src/input.ts'

function cmds(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: '/cmd' + i,
    description: 'd' + i,
  }))
}

test('isSubsequence: basic cases', () => {
  assert.ok(isSubsequence('hst', 'history'))
  assert.ok(isSubsequence('', 'anything'))
  assert.ok(!isSubsequence('xyz', 'history'))
})

test('fuzzy: substring and subsequence surface a command', () => {
  const e = new LineEditor({
    commands: [
      { name: '/history', description: 'h' },
      { name: '/help', description: 'p' },
    ],
  })
  e.buf = '/sto'
  assert.ok(e._suggestions().some((c) => c.name === '/history'))
  e.buf = '/hst'
  assert.ok(e._suggestions().some((c) => c.name === '/history'))
})

test('fuzzy: a single stray letter does not flood the list', () => {
  const e = new LineEditor({
    commands: [
      { name: '/self-fix', description: 'f' },
      { name: '/help', description: 'h' },
    ],
  })
  e.buf = '/x'
  assert.equal(e._suggestions().length, 0)
})

test('paging: Ctrl+N scrolls the suggestion window', () => {
  const e = new LineEditor({ commands: cmds(20) })
  e._renderInputOnly = () => {}
  e.buf = '/'
  e._suggestQuery = ''
  const first = e._suggestionLines(0)
  assert.equal(first.rows, SUGGEST_PAGE + 1) // page + "more" hint
  e._suggestMove(SUGGEST_PAGE)
  assert.ok(e._suggestOffset > 0)
})
