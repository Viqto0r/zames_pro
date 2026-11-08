import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchSlashCommands, suggestWindow } from '../src/input/suggest.ts'
import { SUGGEST_PAGE } from '../src/input/layout.ts'
import type { SlashCommand } from '../src/input/layout.ts'

// The suggestion POPUP is a fixed-height box: the panel reserves exactly the
// rows suggestRowCount() reports, so the window math must never show more rows
// than the page size nor scroll past the end. A wrong offset leaves the popup
// empty at the bottom of the list.

const cmds = (...names: string[]): SlashCommand[] =>
  names.map((name) => ({ name, description: '' }))

const many = (n: number): SlashCommand[] =>
  Array.from({ length: n }, (_, i) => ({
    name: '/c' + String(i).padStart(2, '0'),
    description: '',
  }))

test('the page size is the fixed popup height', () => {
  assert.equal(typeof SUGGEST_PAGE, 'number')
  assert.ok(SUGGEST_PAGE > 0)
})

test('an offset past the end is clamped to the last full page', () => {
  const list = many(SUGGEST_PAGE + 5)
  const w = suggestWindow(list, 999)
  assert.equal(w.shown.length, SUGGEST_PAGE)
  assert.equal(w.off, list.length - SUGGEST_PAGE)
  assert.equal(w.moreCount, 5)
})

test('a negative offset is clamped to the first page', () => {
  const w = suggestWindow(many(SUGGEST_PAGE + 3), -10)
  assert.equal(w.off, 0)
  assert.equal(w.moreCount, 3)
})

test('a short list needs no scrolling and has no tail', () => {
  const w = suggestWindow(many(2), 0)
  assert.equal(w.shown.length, 2)
  assert.equal(w.moreCount, 0)
})

test('the query must start with a slash and stay a single token', () => {
  const list = cmds('/help', '/history')
  assert.deepEqual(matchSlashCommands('help', list), [])
  assert.deepEqual(matchSlashCommands('/he lp', list), [])
  assert.deepEqual(
    matchSlashCommands('/he' + String.fromCharCode(10), list),
    [],
  )
})

test('an over-long query matches nothing', () => {
  const list = cmds('/help')
  assert.deepEqual(matchSlashCommands('/' + 'a'.repeat(41), list), [])
})

test('a bare slash lists every command', () => {
  const list = cmds('/a', '/b', '/c')
  assert.deepEqual(matchSlashCommands('/', list), list)
})

test('the query is matched case-insensitively against the name', () => {
  const list = cmds('/help', '/History', '/other')
  const out = matchSlashCommands('/H', list)
  assert.ok(out.some((c) => c.name === '/History'))
  assert.equal(
    out.some((c) => c.name === '/other'),
    false,
  )
})
