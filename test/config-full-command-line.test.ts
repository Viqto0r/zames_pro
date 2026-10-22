import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleConfigCommand } from '../src/config-command.ts'
import { CONFIG_SCHEMA } from '../src/config.ts'

// `handleConfigCommand` parses with `input.trim().split(/\s+/)` and then reads
// the SUBCOMMAND from `parts[1]`. The main loop passes the WHOLE typed line
// (`/config get ui.locale`), so parts[0] is `/config` and parts[1] is the real
// subcommand — but any caller that passes the text AFTER the command
// (`get ui.locale`, the form every other parser takes) shifted the split by
// one: `get` became the subcommand and `ui.locale` … actually worked, while
// `list`/`path`/`lang` were read as an unknown key.
test('/config list works when the text follows the command name', async () => {
  const lines: string[] = []
  await handleConfigCommand('list', {
    t: ((k: string) => k) as never,
    print: (l) => lines.push(String(l)),
    printErr: (l) => lines.push('ERR ' + String(l)),
    getValue: () => undefined,
    setValue: () => {},
    resetField: () => {},
    showList: () => lines.push('LIST'),
    openMenu: async () => {
      lines.push('MENU')
    },
    currentLocale: () => 'en',
    normalizeLocale: (v) => (String(v) === 'ru' ? 'ru' : 'en'),
    localeDisplayName: (l) => l,
    schema: CONFIG_SCHEMA,
    homeConfigPath: '/h',
    projectConfigPath: '/p',
  })
  assert.deepEqual(lines, ['LIST'])
})
