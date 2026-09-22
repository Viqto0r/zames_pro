import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normText } from '../src/browser.ts'

test('normText схлопывает пробелы и nbsp', () => {
  const NBSP = String.fromCharCode(160)
  assert.equal(normText('a  b'), 'a b')
  assert.equal(normText('a' + NBSP + 'b'), 'a b')
  assert.equal(normText('  x \n\n y  '), 'x y')
})

test('normText: прежний и новый ответ различаются', () => {
  const prev = '{"tool": "Bash", "args": {"command": "ls"}}'
  const next = '{"tool": "Read", "args": {"path": "a.ts"}}'
  assert.notEqual(normText(prev), normText(next))
})

test('normText: тот же ответ с другим форматированием считается тем же', () => {
  const a = '{"tool": "Bash",  "args": {"command": "ls"}}'
  const b = '{"tool": "Bash", "args": {"command": "ls"}}'
  assert.equal(normText(a), normText(b))
})
