import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseBacklogNote,
  collapseBacklog,
  backlogStats,
  backlogNeedsPruning,
  nextBacklogId,
  appendBacklogItem,
} from '../src/backlog.ts'

const NL = String.fromCharCode(10)

// src/backlog.ts maintains BACKLOG.md (gitignored, read by /improve). The
// tricky fenced/unclosed-details cases have their own files; this one pins the
// CORE contract: the note parser, the id counter, the section-aware insert and
// the stats the pruning nudge reads.

test('parseBacklogNote defaults to P2 with the whole text as the title', () => {
  assert.deepEqual(parseBacklogNote('fix the parser'), {
    priority: 'P2',
    title: 'fix the parser',
    note: undefined,
  })
})

test('parseBacklogNote reads the priority and splits title from body', () => {
  assert.deepEqual(parseBacklogNote('P1 title here' + NL + 'why it matters'), {
    priority: 'P1',
    title: 'title here',
    note: 'why it matters',
  })
})

test('a priority is case-insensitive and accepts a tab or a line break', () => {
  assert.equal(parseBacklogNote('p0\ttitle').priority, 'P0')
  assert.deepEqual(parseBacklogNote('P3' + NL + 'real title'), {
    priority: 'P3',
    title: 'real title',
    note: undefined,
  })
})

test('an unknown priority is not a priority token', () => {
  const r = parseBacklogNote('P9 title')
  assert.equal(r.priority, 'P2')
  assert.equal(r.title, 'P9 title')
})

test('a P1-prefixed word is not a priority', () => {
  assert.equal(parseBacklogNote('P1x title').priority, 'P2')
  assert.equal(parseBacklogNote('P1x title').title, 'P1x title')
})

test('parseBacklogNote normalizes CRLF and a lone CR', () => {
  assert.deepEqual(parseBacklogNote('P1 title\r\nbody\r\nmore'), {
    priority: 'P1',
    title: 'title',
    note: 'body' + NL + 'more',
  })
  assert.equal(parseBacklogNote('title\rbody').title, 'title')
})

test('an empty note gives an empty title, not a crash', () => {
  assert.deepEqual(parseBacklogNote(''), {
    priority: 'P2',
    title: '',
    note: undefined,
  })
})

test('nextBacklogId starts at N1 and continues the N sequence', () => {
  assert.equal(nextBacklogId(''), 'N1')
  assert.equal(nextBacklogId('### N1. one' + NL + '### N2. two'), 'N3')
  assert.equal(nextBacklogId('### A1. hand numbered'), 'N1')
})

test('appendBacklogItem inserts under the matching priority section', () => {
  const src = [
    '## P1',
    '',
    '### N1. first',
    '',
    '## P2',
    '',
    '### N2. second',
  ].join(NL)
  const r = appendBacklogItem(src, { title: 'third', priority: 'P2' })
  assert.equal(r.id, 'N3')
  const lines = r.text.split(NL)
  const p2 = lines.indexOf('## P2')
  const n3 = lines.findIndex((l) => l.startsWith('### N3.'))
  assert.ok(n3 > p2, 'the item lands under ## P2')
  assert.equal(lines[n3], '### N3. third')
})

test('appendBacklogItem collapses whitespace in the title', () => {
  const r = appendBacklogItem('## P2', {
    title: '  a   long' + NL + 'title  ',
    priority: 'P2',
  })
  assert.ok(r.text.includes('### N1. a long title'))
})

test('appendBacklogItem defaults to P2 and creates the section', () => {
  const r = appendBacklogItem('# Backlog' + NL, { title: 'x' })
  assert.ok(r.text.includes('## P2'))
  assert.ok(r.text.includes('### N1. x'))
})

test('appendBacklogItem writes the note body under the heading', () => {
  const r = appendBacklogItem('## P2', {
    title: 't',
    priority: 'P2',
    note: 'why' + NL + 'fix',
  })
  assert.ok(r.text.includes('### N1. t' + NL + NL + 'why' + NL + 'fix'))
})

test('backlogStats counts lines, open/done and archive blocks', () => {
  const src = [
    '## P1',
    '',
    '### N1. [ ] open one',
    '',
    '### N2. [x] done one',
    '',
    '<details>',
    '### N2. ~~done one~~',
    '</details>',
  ].join(NL)
  const s = backlogStats(src)
  assert.equal(s.open, 1)
  assert.equal(s.done, 1)
  assert.equal(s.archived, 1)
  assert.equal(s.lines, src.split(NL).length)
  assert.equal(s.chars, src.length)
})

test('backlogNeedsPruning follows the line and char thresholds', () => {
  assert.equal(
    backlogNeedsPruning({
      lines: 10,
      chars: 10,
      open: 0,
      done: 0,
      archived: 0,
    }),
    false,
  )
  assert.equal(
    backlogNeedsPruning({
      lines: 501,
      chars: 10,
      open: 0,
      done: 0,
      archived: 0,
    }),
    true,
  )
  assert.equal(
    backlogNeedsPruning({
      lines: 10,
      chars: 60_001,
      open: 0,
      done: 0,
      archived: 0,
    }),
    true,
  )
})

test('collapseBacklog drops an archived copy and keeps the summary line', () => {
  const src = [
    '## P1',
    '',
    '### N1. [x] finished',
    '',
    '<details>',
    '',
    '### N1. ~~finished~~',
    '',
    'the original body',
    '</details>',
    '',
    '### N2. [ ] open',
  ].join(NL)
  const r = collapseBacklog(src)
  assert.equal(r.collapsed, 1)
  assert.ok(r.text.includes('### N1. [x] finished'))
  assert.ok(!r.text.includes('the original body'))
  assert.ok(r.text.includes('### N2. [ ] open'))
})

test('collapseBacklog is a no-op when there is nothing archived', () => {
  const src = '## P1' + NL + NL + '### N1. [ ] open'
  const r = collapseBacklog(src)
  assert.equal(r.changed, false)
  assert.equal(r.collapsed, 0)
  assert.equal(r.text, src)
})
