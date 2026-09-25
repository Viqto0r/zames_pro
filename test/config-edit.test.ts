import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'

async function freshConfig(): Promise<typeof import('../src/config.ts')> {
  return import('../src/config.ts?t=' + Date.now())
}

test('CONFIG_SCHEMA содержит ui.locale (ru/en)', async () => {
  const { CONFIG_SCHEMA, getConfigField } = await freshConfig()
  const f = getConfigField('ui.locale')
  assert.ok(f)
  assert.equal(f!.type, 'enum')
  assert.deepEqual(f!.values, ['ru', 'en'])
  assert.ok(CONFIG_SCHEMA.length > 5)
})

test('getByPath/setByPath работают с вложенными ключами', async () => {
  const { getByPath, setByPath } = await freshConfig()
  const o: Record<string, unknown> = { a: { b: { c: 1 } } }
  assert.equal(getByPath(o, 'a.b.c'), 1)
  setByPath(o, 'a.b.c', 2)
  assert.equal(getByPath(o, 'a.b.c'), 2)
  setByPath(o, 'x.y.z', 'v')
  assert.equal(getByPath(o, 'x.y.z'), 'v')
})

test('validateConfigValue приводит типы и отвергает мусор', async () => {
  const { validateConfigValue, getConfigField } = await freshConfig()
  const boolF = getConfigField('headless')!
  assert.equal(validateConfigValue(boolF, 'true'), true)
  assert.equal(validateConfigValue(boolF, 'нет'), false)
  assert.throws(() => validateConfigValue(boolF, 'maybe'))

  const numF = getConfigField('maxIterations')!
  assert.equal(validateConfigValue(numF, '7'), 7)
  assert.throws(() => validateConfigValue(numF, 'abc'))
  assert.equal(validateConfigValue(numF, '0'), 0) // min=0: 0 = unlimited
  assert.throws(() => validateConfigValue(numF, '-1')) // min=0

  const enF = getConfigField('ui.locale')!
  assert.equal(validateConfigValue(enF, 'EN'), 'en')
  assert.throws(() => validateConfigValue(enF, 'de'))
})

test('writeConfigValue/resetConfigValue пишут в проектный конфиг', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-cfg-'))
  const origCwd = process.cwd()
  process.chdir(proj)
  try {
    const mod = await freshConfig()
    mod.writeConfigValue('project', 'maxIterations', '12')
    mod.writeConfigValue('project', 'ui.locale', 'en')
    const file = path.join(proj, '.zamesrc.json')
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    assert.equal(data.maxIterations, 12)
    assert.equal(data.ui.locale, 'en')

    mod.resetConfigValue('project', 'maxIterations')
    const data2 = JSON.parse(fs.readFileSync(file, 'utf-8'))
    assert.equal(data2.maxIterations, undefined)
    assert.equal(data2.ui.locale, 'en')
  } finally {
    process.chdir(origCwd)
  }
})

test('writeConfigValue отвергает неизвестный ключ', async () => {
  const mod = await freshConfig()
  assert.throws(() => mod.writeConfigValue('project', 'nope.nope', '1'))
})

test('browser.auth.* есть в схеме и валидируется как строка/bool', async () => {
  const { getConfigField, validateConfigValue, DEFAULTS } = await freshConfig()
  const user = getConfigField('browser.auth.username')
  const pass = getConfigField('browser.auth.password')
  const save = getConfigField('browser.auth.saveSession')
  assert.ok(user && pass && save)
  assert.equal(user!.type, 'string')
  assert.equal(pass!.type, 'string')
  assert.equal(save!.type, 'boolean')
  assert.equal(validateConfigValue(pass!, 'p@ss w/rd'), 'p@ss w/rd')
  // Defaults: no credentials, session persistence on.
  assert.equal(DEFAULTS.browser.auth.username, '')
  assert.equal(DEFAULTS.browser.auth.password, '')
  assert.equal(DEFAULTS.browser.auth.saveSession, true)
})

test('headless по умолчанию включён', async () => {
  const { DEFAULTS } = await freshConfig()
  assert.equal(DEFAULTS.headless, true)
})
