import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterSessions } from '../src/resume-command.ts'
import type { Session } from '../src/types.ts'

// Session files are read from `~/.zames/.sessions` and are hand-editable (and
// written by OLDER builds). A JSON array element that is `null`, or a session
// whose `title` is a NUMBER, made `filterSessions` throw a raw TypeError out of
// the `/sessions` command: `s.title.toLowerCase is not a function`.
// A broken record must be skipped, never crash the list.

test('a null entry is skipped, not fatal', () => {
  const list = [
    null,
    { id: 'x', title: 'A', workdir: '/w' },
  ] as unknown as Session[]
  const out = filterSessions(list, 'a')
  assert.deepEqual(
    out.map((s) => s.id),
    ['x'],
  )
})

test('a non-string title does not throw', () => {
  const list = [{ id: 'y', title: 42, workdir: '/w' }] as unknown as Session[]
  const out = filterSessions(list, 'y')
  assert.deepEqual(out, [])
  // An EMPTY filter returns the list unchanged (no field access).
  assert.equal(filterSessions(list, '').length, 1)
})
