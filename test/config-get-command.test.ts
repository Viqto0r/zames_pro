import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleConfigCommand } from '../src/config-command.ts'
import { CONFIG_SCHEMA } from '../src/config.ts'

// `/config get <path>` reported a REAL, listed setting as an unknown key —
// the field lookup is a plain `schema.find((f) => f.path === key)` over
// CONFIG_SCHEMA, and `ui.locale` IS there, so the dispatcher must not answer
// "unknown key". A wrong answer here sends the operator hunting for a typo in
// a path that is correct.
test('/config get ui.locale finds the setting', async () => {
  const lines: string[] = []
  await handleConfigCommand('get ui.locale', {
    t: ((k: string, p?: Record<string, string>) =>
      p ? k + ':' + JSON.stringify(p) : k) as never,
    print: (l) => lines.push(String(l)),
    printErr: (l) => lines.push('ERR ' + String(l)),
    getValue: () => 'en',
    setValue: () => {},
    resetField: () => {},
    showList: () => lines.push('LIST'),
    openMenu: async () => {},
    currentLocale: () => 'en',
    normalizeLocale: (v) => (String(v) === 'ru' ? 'ru' : 'en'),
    localeDisplayName: (l) => l,
    schema: CONFIG_SCHEMA,
    homeConfigPath: '/h',
    projectConfigPath: '/p',
  })
  assert.equal(lines.length, 1, 'got: ' + lines.join(' | '))
  assert.match(lines[0], /^cfg.value:/)
  assert.match(lines[0], /ui.locale/)
})
