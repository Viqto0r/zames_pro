import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'

// config.ts фиксирует пути (HOME_CONFIG/PROJECT_CONFIG) в момент импорта,
// поэтому для проверки проектного конфига перечитываем модуль динамически
// с query-параметром ПОСЛЕ смены cwd.
async function freshConfig(): Promise<typeof import('../src/config.ts')> {
  return import('../src/config.ts?t=' + Date.now())
}

test('loadConfig без файлов возвращает дефолты', async () => {
  const { loadConfig, DEFAULTS } = await freshConfig()
  const cfg = loadConfig()
  assert.equal(cfg.maxIterations, DEFAULTS.maxIterations)
  assert.equal(cfg.browser.minSendIntervalMs, DEFAULTS.browser.minSendIntervalMs)
  assert.equal(cfg.undo.enabled, true)
})

test('локальный .zamesrc.json переопределяет дефолты', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-proj-'))
  fs.writeFileSync(
    path.join(proj, '.zamesrc.json'),
    JSON.stringify({ maxIterations: 7, browser: { minSendIntervalMs: 999 } }),
  )
  const origCwd = process.cwd()
  process.chdir(proj)
  try {
    const { loadConfig, DEFAULTS } = await freshConfig()
    const cfg = loadConfig()
    assert.equal(cfg.maxIterations, 7)
    assert.equal(cfg.browser.minSendIntervalMs, 999)
    assert.equal(cfg.browser.askRetries, DEFAULTS.browser.askRetries)
  } finally {
    process.chdir(origCwd)
  }
})

test('битый конфиг не роняет loadConfig', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-proj-'))
  fs.writeFileSync(path.join(proj, '.zamesrc.json'), '{ not valid json')
  const origCwd = process.cwd()
  process.chdir(proj)
  try {
    const { loadConfig, DEFAULTS } = await freshConfig()
    const cfg = loadConfig()
    assert.equal(cfg.maxIterations, DEFAULTS.maxIterations)
  } finally {
    process.chdir(origCwd)
  }
})
