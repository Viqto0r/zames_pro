import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SUGGEST_PAGE, type SlashCommand } from '../src/input/layout.ts'
import {
  completeSlashCommand,
  matchSlashCommands,
  suggestWindow,
} from '../src/input/suggest.ts'

const cmds = (...names: string[]): SlashCommand[] =>
  names.map((n) => ({ name: n, description: 'd' }))

const many = (n: number): SlashCommand[] =>
  Array.from({ length: n }, (_, i) => ({
    name: '/cmd' + i,
    description: 'd' + i,
  }))

test('matchSlashCommands: only a leading-slash single short word matches', () => {
  const list = cmds('/help', '/history')
  assert.deepEqual(matchSlashCommands('help', list), [])
  assert.deepEqual(matchSlashCommands('/help me', list), [])
  assert.deepEqual(matchSlashCommands('/' + 'x'.repeat(41), list), [])
  assert.deepEqual(matchSlashCommands('/', list), list)
})

test('matchSlashCommands: prefix before substring before subsequence', () => {
  const list = cmds('/history', '/help', '/self-fix')
  // /hi -> /history (prefix); /help is not a prefix match for "hi"
  const out = matchSlashCommands('/hi', list)
  assert.deepEqual(
    out.map((c) => c.name),
    ['/history'],
  )
  // /he -> /help only
  assert.deepEqual(
    matchSlashCommands('/he', list).map((c) => c.name),
    ['/help'],
  )
  assert.deepEqual(matchSlashCommands('/x', list), [])
})

test('matchSlashCommands: fuzzy subsequence with 2+ chars', () => {
  const list = cmds('/history', '/help')
  assert.ok(matchSlashCommands('/hst', list).some((c) => c.name === '/history'))
})

test('suggestWindow: clamps the offset and reports the more-count', () => {
  const w0 = suggestWindow(many(20), 0)
  assert.equal(w0.shown.length, SUGGEST_PAGE)
  assert.equal(w0.off, 0)
  assert.equal(w0.moreCount, 20 - SUGGEST_PAGE)
  const wBig = suggestWindow(many(20), 999)
  assert.equal(wBig.off, 20 - SUGGEST_PAGE)
  assert.equal(wBig.shown.length, SUGGEST_PAGE)
  assert.equal(suggestWindow(many(3), 0).moreCount, 0)
  assert.deepEqual(suggestWindow([], 0), { shown: [], off: 0, moreCount: 0 })
})

test('completeSlashCommand: explicit selection wins', () => {
  const list = cmds('/help', '/history')
  assert.equal(completeSlashCommand('/he', list, 1), '/history ')
})

test('completeSlashCommand: single match inserts whole', () => {
  assert.equal(completeSlashCommand('/he', cmds('/help'), 0), '/help ')
})

test('completeSlashCommand: multiple matches complete the common prefix', () => {
  const list = cmds('/status', '/stat')
  assert.equal(completeSlashCommand('/sta', list, -1), '/stat')
  assert.equal(completeSlashCommand('/stat', list, -1), null)
})

test('completeSlashCommand: no matches -> null', () => {
  assert.equal(completeSlashCommand('/x', [], -1), null)
})
