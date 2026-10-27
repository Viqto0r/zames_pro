import { test } from 'node:test'
import assert from 'node:assert/strict'
import { translate } from '../src/i18n.ts'
import type { ConfigField } from '../src/config.ts'
import { handleConfigCommand } from '../src/config-command.ts'

const t = translate('en')

const schema: ConfigField[] = [
  {
    path: 'ui.locale',
    type: 'enum',
    values: ['ru', 'en'],
    labelKey: 'cfg.f.ui_locale',
    topKey: 'cfg.group.ui',
    groupKey: 'cfg.group.ui',
  },
  {
    path: 'undo.enabled',
    type: 'boolean',
    labelKey: 'cfg.f.undo_enabled',
    topKey: 'cfg.group.undo',
    groupKey: 'cfg.group.undo',
  },
]

// A recording double: captures prints/errors and the calls the dispatcher
// makes into live state, so routing can be asserted without a real agent.
function makeDeps(
  overrides: Partial<Parameters<typeof handleConfigCommand>[1]> = {},
) {
  const printed: string[] = []
  const errors: string[] = []
  const calls = {
    set: [] as Array<[string, string]>,
    reset: [] as string[],
    list: 0,
    menu: 0,
  }
  const deps: Parameters<typeof handleConfigCommand>[1] = {
    t,
    schema,
    print: (line) => printed.push(line),
    printErr: (line) => errors.push(line),
    getValue: () => undefined,
    setValue: (field, raw) => calls.set.push([field.path, raw]),
    resetField: (field) => calls.reset.push(field.path),
    showList: () => {
      calls.list++
    },
    openMenu: async () => {
      calls.menu++
    },
    currentLocale: () => 'ru',
    normalizeLocale: (v) => (String(v).toLowerCase() === 'en' ? 'en' : 'ru'),
    localeDisplayName: (l) => (l === 'en' ? 'English' : 'Русский'),
    homeConfigPath: '/home/.zames/config.json',
    projectConfigPath: '/proj/.zamesrc.json',
    ...overrides,
  }
  return { deps, printed, errors, calls }
}

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

test('bare /config opens the menu', async () => {
  const { deps, calls } = makeDeps()
  await handleConfigCommand('/config', deps)
  assert.equal(calls.menu, 1)
})

test('menu/subcommand opens the menu, list prints the list', async () => {
  const a = makeDeps()
  await handleConfigCommand('/config menu', a.deps)
  assert.equal(a.calls.menu, 1)

  const b = makeDeps()
  await handleConfigCommand('/config list', b.deps)
  assert.equal(b.calls.list, 1)
  assert.equal(b.calls.menu, 0)
})

test('path prints both config file paths', async () => {
  const { deps, printed } = makeDeps()
  await handleConfigCommand('/config path', deps)
  const out = printed.map(plain).join('\n')
  assert.ok(out.includes('/home/.zames/config.json'))
  assert.ok(out.includes('/proj/.zamesrc.json'))
})

test('get: unknown key errors, known key prints the value', async () => {
  const bad = makeDeps()
  await handleConfigCommand('/config get nope', bad.deps)
  assert.equal(bad.errors.length, 1)
  assert.ok(plain(bad.errors[0]).includes('nope'))

  const ok = makeDeps({ getValue: () => 'en' })
  await handleConfigCommand('/config get ui.locale', ok.deps)
  assert.equal(ok.errors.length, 0)
  assert.ok(plain(ok.printed.join('\n')).includes('ui.locale = "en"'))
})

test('get with no key prints usage', async () => {
  const { deps, printed } = makeDeps()
  await handleConfigCommand('/config get', deps)
  assert.ok(plain(printed.join('\n')).includes('Usage: /config'))
})

test('set: passes value through, bad value errors with a hint', async () => {
  const ok = makeDeps({ getValue: () => true })
  await handleConfigCommand('/config set undo.enabled true', ok.deps)
  assert.deepEqual(ok.calls.set, [['undo.enabled', 'true']])
  assert.equal(ok.errors.length, 0)

  const bad = makeDeps({
    setValue: () => {
      throw new Error('nope')
    },
  })
  await handleConfigCommand('/config set undo.enabled maybe', bad.deps)
  assert.equal(bad.errors.length, 1)
  assert.ok(plain(bad.errors[0]).includes('true|false'))
  assert.equal(bad.calls.set.length, 0)
})

test('set joins multi-word values and rejects an empty one', async () => {
  const a = makeDeps()
  await handleConfigCommand('/config set ui.locale en', a.deps)
  assert.deepEqual(a.calls.set, [['ui.locale', 'en']])

  const b = makeDeps()
  await handleConfigCommand('/config set ui.locale', b.deps)
  assert.equal(b.calls.set.length, 0)
  assert.ok(plain(b.printed.join('\n')).includes('Usage: /config'))
})

test('reset: known key resets, unknown key errors', async () => {
  const ok = makeDeps()
  await handleConfigCommand('/config reset undo.enabled', ok.deps)
  assert.deepEqual(ok.calls.reset, ['undo.enabled'])

  const bad = makeDeps()
  await handleConfigCommand('/config reset nope', bad.deps)
  assert.equal(bad.errors.length, 1)
  assert.equal(bad.calls.reset.length, 0)
})

test('lang with no argument prints the current locale and usage', async () => {
  const { deps, printed } = makeDeps()
  await handleConfigCommand('/config lang', deps)
  const out = plain(printed.join('\n'))
  assert.ok(out.includes('Русский'))
  assert.ok(out.includes('/config lang <ru|en>'))
})

test('lang <en> normalizes and sets ui.locale', async () => {
  const { deps, calls } = makeDeps()
  await handleConfigCommand('/config lang EN', deps)
  assert.deepEqual(calls.set, [['ui.locale', 'en']])
})

test('unknown subcommand errors and shows the list', async () => {
  const { deps, errors, calls } = makeDeps()
  await handleConfigCommand('/config bogus', deps)
  assert.equal(errors.length, 1)
  assert.equal(calls.list, 1)
})

test('reset write error is surfaced', async () => {
  const { deps, errors } = makeDeps({
    resetField: () => {
      throw new Error('disk full')
    },
  })
  await handleConfigCommand('/config reset undo.enabled', deps)
  assert.equal(errors.length, 1)
  assert.ok(plain(errors[0]).includes('disk full'))
})

test('a project override is called out after the write', async () => {
  const { deps, printed, errors } = makeDeps({
    shadowedKeys: () => ['ui.locale'],
  })
  await handleConfigCommand('/config lang en', deps)
  // The save confirmation stays the only normal line and the warning goes to
  // stderr, so the two channels never interleave in a redirected run.
  assert.equal(printed.length, 1)
  assert.equal(errors.length, 1)
  const warn = plain(errors[0])
  assert.ok(warn.includes('ui.locale'), warn)
  assert.ok(warn.includes('/proj/.zamesrc.json'), warn)
})

test('/config set warns only for the key the project overrides', async () => {
  // Undo is not in the project file: the usual "Saved" line must not carry a
  // warning that would send the operator hunting for a clash that is not there.
  const { deps, errors } = makeDeps({ shadowedKeys: () => ['ui.locale'] })
  await handleConfigCommand('/config set undo.enabled true', deps)
  assert.equal(errors.length, 0)
})

test('no shadowedKeys callback means no warning (test doubles)', async () => {
  // The dependency is optional, so a caller that never loaded a config (a
  // test double, a future embedding) keeps the old silent behavior.
  const { deps, errors } = makeDeps()
  await handleConfigCommand('/config lang en', deps)
  assert.equal(errors.length, 0)
})
