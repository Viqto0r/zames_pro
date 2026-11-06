import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleConfigCommand } from '../src/config-command.ts'
import type { ConfigField } from '../src/config.ts'

// `/config set <key> <value>` joins the remaining tokens with ONE space. A
// password is a SECRET and may legally contain repeated spaces, a leading
// space or a TAB (a paste): the join collapsed all of them, so the stored
// password no longer matched the real one and auto-login failed with
// "wrong password" — silently, since the mask hides what was stored.
const schema: ConfigField[] = [
  {
    path: 'browser.auth.password',
    type: 'string',
    labelKey: 'a',
    topKey: 'b',
    groupKey: 'c',
  },
]

function run(line: string): string {
  let saved = ''
  const t = (k: string, p?: Record<string, string>) =>
    k + (p ? JSON.stringify(p) : '')
  void handleConfigCommand(line, {
    t,
    print: () => {},
    printErr: () => {},
    getValue: () => saved,
    setValue: (_f: ConfigField, raw: string) => {
      saved = raw
    },
    resetField: () => {},
    showList: () => {},
    openMenu: async () => {},
    currentLocale: () => 'ru',
    normalizeLocale: (v: unknown) => v as 'ru' | 'en',
    localeDisplayName: (l: string) => l,
    schema,
    homeConfigPath: '/h',
    projectConfigPath: '/p',
  } as never)
  return saved
}

test('a password keeps repeated and leading spaces', () => {
  assert.equal(run('/config set browser.auth.password   pass'), '  pass')
  assert.equal(run('/config set browser.auth.password a  b'), 'a  b')
})
