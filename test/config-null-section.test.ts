// A config file may carry a section as `null` (a hand edit, a merge artifact).
// `deepMerge` sees a non-object value and assigns it verbatim, so the whole
// section is REPLACED by null and every default inside it is lost — `ui` and
// `browser` came back null and the callers that read `ui.locale` /
// `browser.askRetries` threw or silently used a wrong value.
//
// The config module resolves `~/.zames` at IMPORT time, so the scenario runs in
// a CHILD process with its own HOME (a same-process import would keep the real
// path).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeTmpDir } from './tmp-dir.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('a null section keeps the defaults of that section', async (t) => {
  const home = await makeTmpDir(t, 'zames-cfg-null-')
  fs.mkdirSync(path.join(home, '.zames'), { recursive: true })
  fs.writeFileSync(
    path.join(home, '.zames', 'config.json'),
    JSON.stringify({ ui: null, browser: null }),
  )
  const script =
    "import { loadConfig } from '" +
    path.join(root, 'src', 'config.ts') +
    "'; const c = loadConfig();" +
    "if (!c.ui || typeof c.ui.locale !== 'string') { console.log('BAD_UI'); process.exit(0) }" +
    "if (!c.browser || typeof c.browser.askRetries !== 'number') { console.log('BAD_BROWSER'); process.exit(0) }" +
    "console.log('OK')"
  const out = execFileSync('npx', ['tsx', '--eval', script], {
    cwd: root,
    env: { ...process.env, HOME: home },
    encoding: 'utf-8',
    timeout: 60_000,
  })
  assert.match(out, /OK/, 'a null section wiped its defaults: ' + out.trim())
})
