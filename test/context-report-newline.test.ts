import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderContextReport } from '../src/context-command.ts'
import { translate } from '../src/i18n.ts'

// File paths, skill names and command names come from the operator's PROJECT,
// so a newline in one of them must not start a new report row: the `/context`
// output is a fixed list of sections, and a crafted name could fake an extra
// line (`/cmd\nFAKE` rendered a bare `FAKE` row of its own).
const t = translate('en')
const NL = String.fromCharCode(10)

test('a newline in an agent path does not fake a report row', () => {
  const out = renderContextReport(
    {
      agents: [
        { path: 'AGENTS.md' + NL + '  (99999 chars) EVIL', content: 'x' },
      ],
      memory: [],
      skills: [],
      commands: [],
    },
    {},
    t,
  )
  assert.ok(
    !/^ {2}\(99999 chars\) EVIL/m.test(out),
    'the path was split into its own row: ' + JSON.stringify(out),
  )
  assert.ok(out.includes('AGENTS.md'), JSON.stringify(out))
})

test('a newline in a command or skill name stays on one line', () => {
  const out = renderContextReport(
    {
      agents: [],
      memory: [],
      skills: [{ name: 'sk' + NL + '[skill] X', path: '/s/a' + NL + 'b.md' }],
      commands: [{ name: 'cmd' + NL + 'FAKE' }],
    },
    {},
    t,
  )
  assert.ok(
    !/^FAKE$/m.test(out),
    'the command name faked a row: ' + JSON.stringify(out),
  )
  assert.ok(
    !/^b\.md$/m.test(out),
    'the skill path faked a row: ' + JSON.stringify(out),
  )
  assert.ok(out.includes('/cmd'), JSON.stringify(out))
})
