import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  collapseBacklog,
  backlogStats,
  backlogNeedsPruning,
  nextBacklogId,
  appendBacklogItem,
  parseBacklogNote,
} from '../src/backlog.ts'

const NL = String.fromCharCode(10)

const SAMPLE = [
  '# BACKLOG',
  '',
  '## P0 — bugs',
  '',
  '### A1. [x] fixed thing — done (2.0.0)',
  '',
  '<details><summary>old</summary>',
  '',
  '### A1. ~~fixed thing~~',
  '',
  'the original long text',
  '',
  '</details>',
  '',
  '### A2. still broken',
  '',
  '## P2 — quality',
  '',
  '### C1. a cleanup',
  '',
].join(NL)

test('collapseBacklog removes <details> blocks and keeps the summary line', () => {
  const r = collapseBacklog(SAMPLE)
  assert.equal(r.changed, true)
  assert.equal(r.collapsed, 1)
  assert.ok(r.text.includes('### A1. [x] fixed thing'))
  assert.ok(r.text.includes('### A2. still broken'))
  assert.ok(!r.text.includes('<details>'))
  assert.ok(!r.text.includes('the original long text'))
  // Idempotent: a second pass changes nothing.
  const again = collapseBacklog(r.text)
  assert.equal(again.changed, false)
  assert.equal(again.collapsed, 0)
})

test('collapseBacklog is a no-op on a file without archives', () => {
  const r = collapseBacklog('## P0' + NL + NL + '### A1. one' + NL)
  assert.equal(r.changed, false)
})

test('collapseBacklog never mistakes a heading inside a block for a real one', () => {
  const src = [
    '### A1. [x] done',
    '',
    '<details><summary>x</summary>',
    '',
    '### A2. ~~archived~~',
    '',
    '</details>',
    '',
    '### A3. real open',
  ].join(NL)
  const r = collapseBacklog(src)
  assert.ok(!r.text.includes('A2'))
  assert.ok(r.text.includes('### A3. real open'))
})

test('collapseBacklog tolerates an UNCLOSED <details> (keeps real items)', () => {
  // Real case: `### A1. [x] ...` then `<details>` and no `</details>` at all —
  // the whole file became one block. The next REAL heading ends the archive.
  const src = [
    '## P0',
    '',
    '### A1. [x] done one',
    '',
    '<details><summary>x</summary>',
    '',
    '### A1. ~~archived copy~~',
    '',
    'long body',
    '',
    '### A2. still open',
    '',
    '## P1',
    '',
    '### B1. open too',
  ].join(NL)
  const r = collapseBacklog(src)
  assert.ok(r.text.includes('### A1. [x] done one'))
  assert.ok(r.text.includes('### A2. still open'))
  assert.ok(r.text.includes('### B1. open too'))
  assert.ok(!r.text.includes('archived copy'))
  assert.ok(!r.text.includes('long body'))
  const st = backlogStats(r.text)
  assert.equal(st.open, 2)
  assert.equal(st.done, 1)
})

test('collapseBacklog is idempotent on the unclosed-details shape', () => {
  const src = [
    '### A1. [x] done',
    '',
    '<details>',
    '### A1. ~~x~~',
    'body',
    '### A2. open',
  ].join(NL)
  const once = collapseBacklog(src)
  const twice = collapseBacklog(once.text)
  assert.equal(twice.changed, false)
  assert.ok(once.text.includes('### A2. open'))
})

test('backlogStats counts open/done and archived blocks', () => {
  const st = backlogStats(SAMPLE)
  assert.equal(st.open, 2)
  assert.equal(st.done, 1)
  assert.equal(st.archived, 1)
  assert.ok(st.lines > 10)
  assert.ok(st.chars > 100)
})

test('backlogNeedsPruning triggers on a large file', () => {
  const big = new Array(600).fill('x').join(NL)
  assert.equal(backlogNeedsPruning(backlogStats(big)), true)
  assert.equal(backlogNeedsPruning(backlogStats(SAMPLE)), false)
})

test('nextBacklogId returns N1 for a file without N ids', () => {
  assert.equal(nextBacklogId(SAMPLE), 'N1')
})

test('nextBacklogId continues the N sequence', () => {
  const src = SAMPLE + NL + '### N1. first' + NL + '### N3. third' + NL
  assert.equal(nextBacklogId(src), 'N4')
})

test('appendBacklogItem inserts under the matching priority section', () => {
  const { text, id } = appendBacklogItem(SAMPLE, {
    title: 'log rotation',
    priority: 'P2',
    note: 'why it matters',
  })
  assert.equal(id, 'N1')
  // The new item lands right after the `## P2` header, before `### C1`.
  const iNew = text.indexOf('### N1. log rotation')
  const iC1 = text.indexOf('### C1. a cleanup')
  const iP2 = text.indexOf('## P2')
  assert.ok(iP2 !== -1 && iNew !== -1 && iC1 !== -1)
  assert.ok(iP2 < iNew && iNew < iC1)
  assert.ok(text.includes('why it matters'))
  // The item is OPEN (no [x]) so /improve can pick it up.
  const st = backlogStats(text)
  assert.equal(st.open, 3)
})

test('appendBacklogItem defaults to P2 and creates the section if missing', () => {
  const src = '## P0 — bugs' + NL + NL + '### A1. one' + NL
  const { text, id } = appendBacklogItem(src, { title: 'no priority given' })
  assert.equal(id, 'N1')
  assert.ok(text.includes('## P2'))
  assert.ok(text.includes('### N1. no priority given'))
})

test('parseBacklogNote splits priority, title and body', () => {
  assert.deepEqual(parseBacklogNote('P0 fix the thing'), {
    priority: 'P0',
    title: 'fix the thing',
    note: undefined,
  })
  assert.deepEqual(parseBacklogNote('do a thing'), {
    priority: 'P2',
    title: 'do a thing',
    note: undefined,
  })
})

test('parseBacklogNote keeps the first line as title and the rest as note', () => {
  const NL = String.fromCharCode(10)
  assert.deepEqual(
    parseBacklogNote('P1 title here' + NL + 'body line 1' + NL + 'body line 2'),
    {
      priority: 'P1',
      title: 'title here',
      note: 'body line 1' + NL + 'body line 2',
    },
  )
})

test('parseBacklogNote trims a body but not the title line', () => {
  const NL = String.fromCharCode(10)
  assert.deepEqual(parseBacklogNote('title' + NL + NL + '  body  ' + NL), {
    priority: 'P2',
    title: 'title',
    note: 'body',
  })
})

test('appendBacklogItem collapses whitespace in the title', () => {
  const { text } = appendBacklogItem(SAMPLE, { title: 'a   b' })
  assert.ok(text.includes('### N1. a b'))
  assert.ok(!text.includes('### N1. a   b'))
})
