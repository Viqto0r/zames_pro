// A project `.zamesrc.json` is merged AFTER the HOME config, so a key it also
// sets silently wins. That is how a stale `ui.locale: en` made `/config lang
// ru` look broken: the write went to ~/.zames/config.json, the next launch read
// the project file and the interface came back English.
//
// `overriddenKeys()` is the PURE half (no disk); the end-to-end half runs in a
// CHILD process because config.ts resolves ~/.zames at IMPORT time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeTmpDir } from './tmp-dir.js'
import { overriddenKeys } from '../src/config.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('overriddenKeys: only keys present in BOTH files', () => {
  const home = { ui: { locale: 'ru', answerWidth: 0 } }
  const project = { ui: { locale: 'en' } }
  assert.deepEqual(overriddenKeys(home, project), ['ui.locale'])
})

test('overriddenKeys: nested leaves are reported by full path', () => {
  const home = { browser: { auth: { username: 'a', password: 'b' } } }
  const project = { browser: { auth: { username: 'c' } } }
  assert.deepEqual(overriddenKeys(home, project), ['browser.auth.username'])
})

test('overriddenKeys: a key only the project sets is not a clash', () => {
  assert.deepEqual(
    overriddenKeys({ ui: { locale: 'ru' } }, { undo: { enabled: true } }),
    [],
  )
})

test('overriddenKeys: a missing side yields no clashes', () => {
  assert.deepEqual(overriddenKeys(null, { ui: { locale: 'en' } }), [])
  assert.deepEqual(overriddenKeys({ ui: { locale: 'ru' } }, null), [])
})

test('overriddenKeys: prototype keys are skipped', () => {
  const project = JSON.parse('{"__proto__": {"polluted": 1}}') as Record<
    string,
    unknown
  >
  assert.deepEqual(overriddenKeys({}, project), [])
})

test('loadConfig reports the shadowed keys of the project file', async (t) => {
  const home = await makeTmpDir(t, 'zames-cfg-shadow-')
  const proj = await makeTmpDir(t, 'zames-cfg-shadow-proj-')
  fs.mkdirSync(path.join(home, '.zames'), { recursive: true })
  fs.writeFileSync(
    path.join(home, '.zames', 'config.json'),
    JSON.stringify({ ui: { locale: 'ru' } }),
  )
  fs.writeFileSync(
    path.join(proj, '.zamesrc.json'),
    JSON.stringify({ ui: { locale: 'en' } }),
  )
  const script =
    "import { loadConfig, shadowedConfigKeys } from '" +
    path.join(root, 'src', 'config.ts') +
    "'; const c = loadConfig();" +
    'console.log(JSON.stringify({ locale: c.ui.locale, shadowed: shadowedConfigKeys() }))'
  const out = execFileSync('npx', ['tsx', '--eval', script], {
    cwd: proj,
    env: { ...process.env, HOME: home },
    encoding: 'utf-8',
    timeout: 60_000,
  })
  const parsed = JSON.parse(out.trim().split('\n').pop() as string) as {
    locale: string
    shadowed: string[]
  }
  assert.equal(parsed.locale, 'en', 'the project file must still win')
  assert.deepEqual(parsed.shadowed, ['ui.locale'])
})
