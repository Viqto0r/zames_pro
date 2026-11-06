import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backgroundOsc } from '../src/tui/background.ts'

// `NO_COLOR` is specified by no-color.org as "present means no colour", so ANY
// value opts out — correct. `ZAMES_NO_BG` is zames' OWN switch and has no such
// spec: an operator writing `ZAMES_NO_BG=0` (or `false`) in a shell profile or
// a CI env clearly means KEEP the background, yet the bare presence check
// silently dropped it. Only a truthy value should opt out.
const keep = {}
const restore = (): void => {
  for (const [k, v] of Object.entries(keep)) process.env[k] = String(v)
  for (const k of ['ZAMES_NO_BG', 'NO_COLOR']) {
    if (!(k in keep)) delete process.env[k]
  }
}

test('ZAMES_NO_BG=0 keeps the background', () => {
  const prev = { ...process.env }
  delete process.env.NO_COLOR
  process.env.ZAMES_NO_BG = '0'
  try {
    assert.notEqual(backgroundOsc('zames'), '')
  } finally {
    process.env = prev
  }
})

test('ZAMES_NO_BG=1 opts out', () => {
  const prev = { ...process.env }
  delete process.env.NO_COLOR
  process.env.ZAMES_NO_BG = '1'
  try {
    assert.equal(backgroundOsc('zames'), '')
  } finally {
    process.env = prev
  }
})

void keep
void restore
