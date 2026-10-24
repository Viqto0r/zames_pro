// The «/» hint list merges the built-in commands with the DYNAMIC ones (project
// skills / custom commands). The de-dup set is case-insensitive for built-ins,
// but two DYNAMIC entries that differ only by case are both added: the operator
// sees the same command twice (`/foo` and `/FOO`), and the SECOND is never
// reachable — the shell resolves a slash command case-insensitively.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSlashCommandHints } from '../src/commands.ts'
import { translate } from '../src/i18n.ts'

const t = translate('en')

test('two dynamic hints that differ only by case collapse to one', () => {
  const hints = buildSlashCommandHints({
    devMode: false,
    t,
    dynamic: [
      { name: '/foo', description: 'first' },
      { name: '/FOO', description: 'second' },
    ],
  })
  const dupes = hints.filter((h) => h.name.toLowerCase() === '/foo')
  assert.equal(dupes.length, 1, 'duplicate: ' + JSON.stringify(dupes))
  assert.equal(dupes[0].name, '/foo')
})

test('distinct dynamic hints are kept (control)', () => {
  const hints = buildSlashCommandHints({
    devMode: false,
    t,
    dynamic: [
      { name: '/foo', description: 'first' },
      { name: '/bar', description: 'second' },
    ],
  })
  assert.ok(hints.some((h) => h.name === '/foo'))
  assert.ok(hints.some((h) => h.name === '/bar'))
})
