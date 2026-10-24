// A dynamic slash hint (project skill / custom command) must be a SLASH
// command: the «/» list shows the name and the operator types it. A name
// without the leading slash (`nosl`, from a custom command whose frontmatter
// `name:` omitted it) appeared in the list as a bare word, and typing it as a
// command never matched. The empty name produced a blank row.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSlashCommandHints } from '../src/commands.ts'
import { translate } from '../src/i18n.ts'

const t = translate('en')

test('a dynamic hint name is normalized to a slash command', () => {
  const hints = buildSlashCommandHints({
    devMode: false,
    t,
    dynamic: [{ name: 'nosl', description: 'y' }],
  })
  assert.ok(
    hints.some((h) => h.name === '/nosl'),
    'not slash-prefixed: ' +
      JSON.stringify(hints.filter((h) => h.name.includes('nosl'))),
  )
  assert.ok(!hints.some((h) => h.name === 'nosl'))
})

test('an empty dynamic name is dropped', () => {
  const hints = buildSlashCommandHints({
    devMode: false,
    t,
    dynamic: [{ name: '', description: 'x' }],
  })
  assert.ok(!hints.some((h) => h.name.trim() === ''))
})

test('a normal dynamic hint is unchanged (control)', () => {
  const hints = buildSlashCommandHints({
    devMode: false,
    t,
    dynamic: [{ name: '/deploy', description: 'z' }],
  })
  assert.ok(hints.some((h) => h.name === '/deploy'))
})
