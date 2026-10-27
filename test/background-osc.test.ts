import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backgroundOsc } from '../src/tui/background.ts'
import { PALETTES } from '../src/theme.ts'

// A terminal can only be repainted where the app WRITES, so the window
// background is set with an OSC-11 sequence. The encoding must be exact (a
// wrong one is silently ignored by the terminal and the feature looks broken).

test('backgroundOsc encodes the palette bg as OSC-11 rgb:rr/gg/bb', () => {
  const seq = backgroundOsc('zames')
  assert.equal(seq, '\x1b]11;rgb:23/27/2e\x07')
  assert.ok(seq.startsWith('\x1b]11;rgb:'))
  assert.ok(seq.endsWith('\x07'))
})

test('each palette has its own background', () => {
  const a = backgroundOsc('zames')
  const b = backgroundOsc('dracula')
  assert.notEqual(a, b)
  assert.ok(a.includes(PALETTES.zames.bg.slice(1, 3)))
})

test('an unknown id falls back to the default background', () => {
  assert.equal(backgroundOsc('nope'), backgroundOsc('zames'))
  assert.equal(backgroundOsc(undefined), backgroundOsc('zames'))
})

test('NO_COLOR and ZAMES_NO_BG opt out completely', () => {
  const prevNc = process.env.NO_COLOR
  const prevBg = process.env.ZAMES_NO_BG
  try {
    process.env.NO_COLOR = '1'
    assert.equal(backgroundOsc('dracula'), '')
    delete process.env.NO_COLOR
    process.env.ZAMES_NO_BG = '1'
    assert.equal(backgroundOsc('dracula'), '')
  } finally {
    if (prevNc === undefined) delete process.env.NO_COLOR
    else process.env.NO_COLOR = prevNc
    if (prevBg === undefined) delete process.env.ZAMES_NO_BG
    else process.env.ZAMES_NO_BG = prevBg
  }
})
