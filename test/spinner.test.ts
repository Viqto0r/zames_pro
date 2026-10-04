import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stripEllipsis,
  randomThinkingPhrase,
  renderDots,
  DOTS,
  createSpinner,
} from '../src/spinner.ts'

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

test('stripEllipsis removes trailing dots and the ellipsis char', () => {
  assert.equal(stripEllipsis('thinking...'), 'thinking')
  assert.equal(stripEllipsis('thinking…'), 'thinking')
  // A space BEFORE the dots is part of the phrase, not the ellipsis, so it stays.
  assert.equal(stripEllipsis('thinking ... '), 'thinking ')
  assert.equal(stripEllipsis('no dots'), 'no dots')
  assert.equal(stripEllipsis(''), '')
})

test('DOTS has four animation phases', () => {
  assert.equal(DOTS.length, 4)
  assert.equal(DOTS[0], '')
  assert.equal(DOTS[3], '...')
})

test('randomThinkingPhrase returns a non-empty phrase for both locales', () => {
  for (const loc of ['ru', 'en'] as const) {
    const p = randomThinkingPhrase(loc)
    assert.ok(p.length > 0, `empty phrase for ${loc}`)
  }
})

test('randomThinkingPhrase always returns a string', () => {
  const a = randomThinkingPhrase('ru')
  const b = randomThinkingPhrase('ru')
  assert.equal(typeof a, 'string')
  assert.equal(typeof b, 'string')
})

test('renderDots pads every phase to the same width', () => {
  const widths = new Set<number>()
  for (let i = 0; i < DOTS.length; i++) {
    widths.add(stripAnsi(renderDots(i)).length)
  }
  assert.equal(widths.size, 1, 'all phases must be padded to one width')
})

test('renderDots on an out-of-range phase does not throw', () => {
  assert.equal(typeof renderDots(99), 'string')
  assert.equal(typeof renderDots(-1), 'string')
})

test('createSpinner returns the full UI surface and stop() is safe', () => {
  const ui = createSpinner('ru')
  for (const k of [
    'thinking',
    'sendPause',
    'setPending',
    'toolCall',
    'toolResult',
    'assistant',
    'warning',
    'stop',
    'succeed',
    'fail',
  ] as const) {
    assert.equal(typeof ui[k], 'function', `missing ${k}`)
  }
  ui.stop()
  ui.stop()
})
