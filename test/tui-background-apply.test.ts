import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyBackground, backgroundOsc } from '../src/tui/background.ts'
import { ALL_PALETTES, DEFAULT_THEME } from '../src/theme.ts'

// `applyBackground` WRITES the OSC-11 sequence to stdout on a theme switch and
// after the alternate screen exits. The encoding is covered by the two
// background-* files; pinned here is the APPLY contract: the exact bytes reach
// stdout, an opt-out writes NOTHING, an unknown palette falls back to the
// default, and a throwing stdout never breaks a theme switch.

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

function capture(fn: () => void): string[] {
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
    ;(process.stdout as unknown as { write: unknown }).write = orig
  }
  return writes
}

test('applyBackground writes the OSC-11 sequence of the palette', () => {
  const writes = capture(() => applyBackground('dracula'))
  assert.deepEqual(writes, [backgroundOsc('dracula')])
  assert.ok(writes[0].startsWith(ESC + ']11;rgb:'))
  assert.ok(writes[0].endsWith(BEL))
})

test('the written colour is the palette background', () => {
  const writes = capture(() => applyBackground('nord'))
  const hex = ALL_PALETTES.nord.bg.replace('#', '')
  assert.ok(
    writes[0].includes(
      hex.slice(0, 2) + '/' + hex.slice(2, 4) + '/' + hex.slice(4, 6),
    ),
  )
})

test('an unknown palette paints the DEFAULT background', () => {
  const writes = capture(() => applyBackground('no-such-theme'))
  assert.deepEqual(writes, [backgroundOsc(DEFAULT_THEME)])
})

test('NO_COLOR opts out and writes nothing', () => {
  const prev = process.env.NO_COLOR
  process.env.NO_COLOR = '1'
  try {
    assert.deepEqual(
      capture(() => applyBackground('zames')),
      [],
    )
  } finally {
    if (prev === undefined) delete process.env.NO_COLOR
    else process.env.NO_COLOR = prev
  }
})

test('a throwing stdout does not break the theme switch', () => {
  const orig = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: () => boolean }).write = () => {
    throw new Error('EPIPE')
  }
  try {
    assert.doesNotThrow(() => applyBackground('zames'))
  } finally {
    ;(process.stdout as unknown as { write: unknown }).write = orig
  }
})
