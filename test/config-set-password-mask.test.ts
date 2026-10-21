import { test } from 'node:test'
import assert from 'node:assert/strict'
import { translate } from '../src/i18n.ts'
import type { ConfigField } from '../src/config.ts'
import { handleConfigCommand } from '../src/config-command.ts'

// /config set on a PASSWORD field used to echo the value back in the clear:
// `Saved: browser.auth.password = "hunter2"`. Every other place that shows a
// password (`/config get`, the list, the menu) masks it, but the confirmation
// line did not — the secret landed in the terminal scrollback, the transcript
// and a screenshot. It must be masked there too.
const t = translate('en')
const schema: ConfigField[] = [
  {
    path: 'browser.auth.password',
    type: 'string',
    labelKey: 'cfg.f.password',
    groupKey: 'cfg.group.browser',
  },
  {
    path: 'browser.auth.username',
    type: 'string',
    labelKey: 'cfg.f.username',
    groupKey: 'cfg.group.browser',
  },
]
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

function makeDeps(values: Record<string, unknown>) {
  const printed: string[] = []
  const deps: Parameters<typeof handleConfigCommand>[1] = {
    t,
    schema,
    print: (line) => printed.push(line),
    printErr: (line) => printed.push(line),
    getValue: (p) => values[p],
    setValue: (field, raw) => {
      values[field.path] = raw
    },
    resetField: () => {},
    showList: () => {},
    openMenu: async () => {},
    currentLocale: () => 'en',
    normalizeLocale: () => 'en',
    localeDisplayName: (l) => String(l),
    homeConfigPath: '/home/.zames/config.json',
    projectConfigPath: '/proj/.zamesrc.json',
  }
  return { deps, printed }
}

test('/config set on a password does not echo the secret', async () => {
  const values: Record<string, unknown> = {}
  const { deps, printed } = makeDeps(values)
  await handleConfigCommand('/config set browser.auth.password hunter2', deps)
  const out = plain(printed.join('\n'))
  assert.ok(!out.includes('hunter2'), 'secret leaked: ' + out)
  assert.ok(out.includes('********'), 'expected the mask: ' + out)
  assert.equal(
    values['browser.auth.password'],
    'hunter2',
    'value must be saved',
  )
})

test('/config set on a non-password still shows the value', async () => {
  const values: Record<string, unknown> = {}
  const { deps, printed } = makeDeps(values)
  await handleConfigCommand('/config set browser.auth.username alice', deps)
  const out = plain(printed.join('\n'))
  assert.ok(out.includes('alice'), 'a normal value must stay visible: ' + out)
})
