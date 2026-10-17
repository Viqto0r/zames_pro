// collapseBacklog() removes the ARCHIVED copy of a finished item (the
// `### X. ~~original~~` block wrapped in <details>). It keyed the removal on
// any `<details>` line, so a NOTE that merely MENTIONS `Use <details> in
// README:` had everything after it — the actual note text — deleted from
// BACKLOG.md. Only an archive block (one that carries a struck-through item
// heading) may be removed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collapseBacklog } from '../src/backlog.ts'

const NL = String.fromCharCode(10)

test('a note body mentioning <details> survives a collapse', () => {
  const md = [
    '## P1',
    '',
    '### N1. note with details',
    '',
    'Use <details> in README:',
    '<details>',
    'x',
    '</details>',
    '',
    '### N2. another note',
  ].join(NL)
  const out = collapseBacklog(md).text
  assert.ok(out.includes('Use <details> in README:'), out)
  assert.ok(out.includes('### N2. another note'), out)
})

test('a real archive block is still collapsed', () => {
  const md = [
    '## P1',
    '',
    '### A1. [x] done thing',
    '',
    '<details>',
    '<summary>old</summary>',
    '',
    '### A1. ~~done thing~~',
    '',
    'body',
    '',
    '</details>',
    '',
    '### A2. open',
  ].join(NL)
  const res = collapseBacklog(md)
  assert.equal(res.collapsed, 1)
  assert.ok(res.text.includes('### A1. [x] done thing'))
  assert.ok(res.text.includes('### A2. open'))
  assert.equal(res.text.includes('~~done thing~~'), false)
})
