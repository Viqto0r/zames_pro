import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { makeTmpDirSync } from './tmp-dir.ts'

// config.ts fixes the paths (HOME_CONFIG/PROJECT_CONFIG) at import time,
// so to test the project config we re-read the module dynamically with a
// query parameter AFTER changing cwd.
async function freshConfig(): Promise<typeof import('../src/config.ts')> {
  return import('../src/config.ts?t=' + Date.now())
}

test('loadConfig без файлов возвращает дефолты', async (t) => {
  // Run in a clean temp directory: the project's own .zamesrc.json (if any)
  // must not leak into the "no config files" case.
  const proj = makeTmpDirSync(t, 'zames-proj-')
  const origCwd = process.cwd()
  process.chdir(proj)
  try {
    const { loadConfig, DEFAULTS } = await freshConfig()
    const cfg = loadConfig()
    assert.equal(cfg.maxIterations, DEFAULTS.maxIterations)
    assert.equal(
      cfg.browser.minSendIntervalMs,
      DEFAULTS.browser.minSendIntervalMs,
    )
    assert.equal(cfg.undo.enabled, true)
  } finally {
    process.chdir(origCwd)
  }
})

test('локальный .zamesrc.json переопределяет дефолты', async (t) => {
  const proj = makeTmpDirSync(t, 'zames-proj-')
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

test('прототип-загрязнение через .zamesrc.json не проходит', async (t) => {
  const proj = makeTmpDirSync(t, 'zames-proj-')
  fs.writeFileSync(
    path.join(proj, '.zamesrc.json'),
    JSON.stringify({ __proto__: { polluted: 'yes' }, constructor: { x: 1 } }),
  )
  const origCwd = process.cwd()
  process.chdir(proj)
  try {
    const { loadConfig } = await freshConfig()
    loadConfig()
    // The poisoned key must NOT have reached Object.prototype.
    assert.equal(
      ({} as Record<string, unknown>).polluted,
      undefined,
      'Object.prototype was polluted',
    )
  } finally {
    process.chdir(origCwd)
  }
})

test('битый конфиг не роняет loadConfig', async (t) => {
  const proj = makeTmpDirSync(t, 'zames-proj-')
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
