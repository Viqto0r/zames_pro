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
  assert.throws(() => validateConfigValue(numF, '0')) // min=1

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
