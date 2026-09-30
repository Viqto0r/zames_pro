import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLiveToggle } from '../src/commands.ts'

test('parseLiveToggle: thinking aliases and modes', () => {
  assert.deepEqual(parseLiveToggle('/thinking'), {
    kind: 'thinking',
    mode: 'toggle',
  })
  assert.deepEqual(parseLiveToggle('/thinking on'), {
    kind: 'thinking',
    mode: 'on',
  })
  assert.deepEqual(parseLiveToggle('/thinking off'), {
    kind: 'thinking',
    mode: 'off',
  })
})

test('parseLiveToggle: search aliases map to the search toggle', () => {
  for (const name of ['/web', '/websearch', '/search']) {
    assert.deepEqual(parseLiveToggle(name), {
      kind: 'search',
      mode: 'toggle',
    })
  }
  assert.deepEqual(parseLiveToggle('/web on'), { kind: 'search', mode: 'on' })
  assert.deepEqual(parseLiveToggle('/web off'), {
    kind: 'search',
    mode: 'off',
  })
})

test('parseLiveToggle: accepts on/off synonyms and trims', () => {
  assert.deepEqual(parseLiveToggle('  /thinking 1 '), {
    kind: 'thinking',
    mode: 'on',
  })
  assert.deepEqual(parseLiveToggle('/thinking false'), {
    kind: 'thinking',
    mode: 'off',
  })
  assert.deepEqual(parseLiveToggle('/web вкл'), {
    kind: 'search',
    mode: 'on',
  })
})

test('parseLiveToggle: rejects non-commands and bad args', () => {
  assert.equal(parseLiveToggle('/thinking maybe'), null)
  assert.equal(parseLiveToggle('/web on now'), null)
  assert.equal(parseLiveToggle('thinking'), null)
  assert.equal(parseLiveToggle(''), null)
  // Not a toggle command.
  assert.equal(parseLiveToggle('/compact'), null)
  assert.equal(parseLiveToggle('/queue'), null)
})
