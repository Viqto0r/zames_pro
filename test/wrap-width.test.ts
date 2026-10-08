import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wrapToWidth, visLen } from '../src/input.ts'

// Service messages (warnings, send failures) used to be printed at the FULL
// terminal width and wrapped by the terminal itself — mid-word and at a
// different margin than the tool previews (cols-1), which looked ragged.
// wrapToWidth wraps them at the same margin so every printed line fits.

test('wrapToWidth leaves a short string untouched', () => {
  assert.equal(wrapToWidth('hello world', 40), 'hello world')
})

test('wrapToWidth breaks on spaces, never mid-word', () => {
  const out = wrapToWidth('aaa bbb ccc ddd', 7)
  assert.equal(out, 'aaa bbb\nccc ddd')
  for (const line of out.split('\n')) {
    assert.ok(visLen(line) <= 7, 'line fits: ' + line)
  }
})

test('wrapToWidth hard-splits a word longer than the width', () => {
  const out = wrapToWidth('x'.repeat(25), 10)
  const lines = out.split('\n')
  assert.ok(lines.length >= 3)
  for (const line of lines) assert.ok(visLen(line) <= 10, line)
  assert.equal(lines.join(''), 'x'.repeat(25))
})

test('wrapToWidth preserves explicit newlines', () => {
  const NL = String.fromCharCode(10)
  const out = wrapToWidth('a' + NL + 'b', 10)
  assert.equal(out, 'a' + NL + 'b')
})

test('wrapToWidth keeps every line within the margin for a long sentence', () => {
  const msg =
    'Отправка не удалась (попытка 2/3 на этот запрос): ответ не начал ' +
    'генерироваться за 35с — повторяю...'
  const out = wrapToWidth('⚠ ' + msg, 40)
  for (const line of out.split('\n')) {
    assert.ok(visLen(line) <= 40, 'too wide: ' + line)
  }
})
