import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleConfigCommand } from '../src/config-command.ts'
import type { ConfigField } from '../src/config.ts'

// `/config lang <v>` must VALIDATE the value. `normalizeLocale` falls back to
// the default for anything it does not understand, so `/config lang xx`
// silently SAVED English and reported «язык: English» — the operator's typo
// was accepted and the setting changed without a warning.
const schema: ConfigField[] = [
  {
    path: 'ui.locale',
    type: 'enum',
    values: ['ru', 'en'],
    labelKey: 'a',
    topKey: 'b',
    groupKey: 'c',
  },
]

test('an unknown language is rejected, not silently defaulted', async () => {
  const out: string[] = []
  let saved: string | null = null
  const t = (k: string, p?: Record<string, string>) =>
    k + (p ? JSON.stringify(p) : '')
  await handleConfigCommand('/config lang xx', {
    t,
    print: (l: string) => out.push('P ' + l),
    printErr: (l: string) => out.push('E ' + l),
    getValue: () => saved,
    setValue: (_f: ConfigField, raw: string) => {
      saved = raw
    },
    resetField: () => {},
    showList: () => {},
    openMenu: async () => {},
    currentLocale: () => 'ru',
    normalizeLocale: (v: unknown) =>
      (({ ru: 'ru', en: 'en' }) as Record<string, string>)[
        String(v).toLowerCase()
      ] as 'ru' | 'en',
    localeDisplayName: (l: string) => l,
    schema,
    homeConfigPath: '/h',
    projectConfigPath: '/p',
  } as never)
  assert.equal(saved, null, 'an unknown language was saved: ' + saved)
  assert.ok(
    out.some((l) => l.startsWith('E ')),
    'no error was printed: ' + JSON.stringify(out),
  )
})
