// Tab completion of a slash command either inserts the whole name plus a
// SPACE (ready for the argument) or extends the typed prefix. When several
// commands share a prefix and that prefix happens to be a COMPLETE command
// name (`/config` vs `/configure`), the multi-match branch returned the bare
// name with no trailing space — so `/co<Tab>` left `/config` in the buffer
// while the operator had to type the space by hand, unlike `/co<Tab>` with a
// single match (which appends it).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  completeSlashCommand,
  matchSlashCommands,
} from '../src/input/suggest.js'

const cmds = (names: string[]) =>
  names.map((n) => ({ name: n, description: 'd' }))

test('a completion that lands on a full command name ends with a space', () => {
  const list = cmds(['/config', '/configure'])
  const out = completeSlashCommand('/co', matchSlashCommands('/co', list), -1)
  assert.equal(out, '/config ')
})

test('a completion that only extends the prefix has no space (control)', () => {
  const list = cmds(['/help', '/hello'])
  assert.equal(
    completeSlashCommand('/he', matchSlashCommands('/he', list), -1),
    '/hel',
  )
})
