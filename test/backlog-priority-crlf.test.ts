import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBacklogNote } from '../src/backlog.ts'

// A note typed on Windows can put the priority on its OWN line (or the text
// arrives with a CRLF right after `P1`). The priority token is recognised only
// when followed by a SPACE, so `P1\r\n...` fell through: the priority stayed
// the default P2, the title became the literal `P1` and the real title went
// into the body - a note filed under the wrong section with a useless heading.
test('a priority followed by CRLF is still the priority', () => {
  const n = parseBacklogNote('P1\r\nfix the thing\r\nmore detail')
  assert.equal(n.priority, 'P1')
  assert.equal(n.title, 'fix the thing')
  assert.equal(n.note, 'more detail')
})

test('a priority on its own LF line is still the priority', () => {
  const n = parseBacklogNote('P0\nurgent fix')
  assert.equal(n.priority, 'P0')
  assert.equal(n.title, 'urgent fix')
})

test('the classic one-line form is unchanged', () => {
  assert.deepEqual(parseBacklogNote('P3 nice to have'), {
    priority: 'P3',
    title: 'nice to have',
    note: undefined,
  })
})
