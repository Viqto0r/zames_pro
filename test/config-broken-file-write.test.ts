import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeTmpDir } from './tmp-dir.ts'

// `writeConfigValue(scope, …)` must not DESTROY a config file it cannot parse.
// The guard was "throw unless ENOENT", so a hand-edited file with a trailing
// comma, a merge-conflict marker or a bare-word value made every write fail —
// and a caller that swallowed the error then wrote the SINGLE edited key over
// the whole file, dropping every other setting. `loadConfig` (which MERGES the
// files) has always tolerated a broken file with a warning; the writer must
// behave the same: keep going and PRESERVE the unparsable text.
function writeTo(file: string, key: string, raw: string): unknown {
  // The module resolves the config paths from HOME/cwd at import time, so the
  // call runs in a CHILD PROCESS with HOME/cwd pointed at a throwaway dir.
  const script = [
    'import { writeConfigValue, readConfigFile } from ' +
      JSON.stringify(process.cwd() + '/src/config.ts'),
    'const file = process.argv[1]',
    'const key = process.argv[2]',
    'const raw = process.argv[3]',
    'try {',
    '  writeConfigValue("project", key, raw)',
    '  console.log(JSON.stringify({ ok: true, parsed: readConfigFile(file) }))',
    '} catch (e) {',
    '  console.log(JSON.stringify({ ok: false, error: e.message }))',
    '}',
  ].join(String.fromCharCode(10))
  // Resolve tsx from THIS repo: the child runs with cwd = the temp project, so
  // a bare `tsx` specifier would not be found there.
  const res = spawnSync(
    process.execPath,
    [
      '--import',
      TSX_LOADER,
      '--input-type=module',
      '-e',
      script,
      file,
      key,
      raw,
    ],
    // `projectConfigPath()` is `cwd/.zamesrc.json`, so the child MUST run in
    // the temp project dir for a "project" write to hit the temp file.
    {
      cwd: path.dirname(file),
      encoding: 'utf-8',
      timeout: 60_000,
    },
  )
  const lines = String(res.stdout || '{}')
    .trim()
    .split(String.fromCharCode(10))
  return JSON.parse(lines[lines.length - 1] || '{}')
}

/** Absolute file URL of the tsx loader, resolved from the repo under test. */
const TSX_LOADER = import.meta.resolve('tsx')

const NL = String.fromCharCode(10)

const BROKEN_CASES: Array<[string, string]> = [
  ['a trailing comma', '{ "maxIterations": 5, }'],
  [
    'a merge-conflict marker',
    '<<<<<<< HEAD' + NL + '{ "maxIterations": 5 }' + NL,
  ],
  ['a bare-word value', '{ "maxIterations": 5, "provider": deepseek }'],
]

for (const [label, text] of BROKEN_CASES) {
  test(`a broken config file (${label}) does not abort a write`, async (t) => {
    const root = await makeTmpDir(t, 'zames-cfgbroken-')
    const file = path.join(root, '.zamesrc.json')
    fs.writeFileSync(file, text)
    const out = writeTo(file, 'ui.locale', 'en') as {
      ok: boolean
      error?: string
    }
    assert.equal(
      out.ok,
      true,
      'the write threw on a file loadConfig tolerates: ' + out.error,
    )
    // The unparsable text is kept next to the file so it can be repaired by
    // hand; the settings in it are never silently dropped.
    const dir = fs.readdirSync(root)
    assert.ok(
      dir.some((f) => f.includes('.broken-')),
      'no backup of the unparsable file: ' + dir.join(', '),
    )
  })
}

// The happy path still parses and keeps every unrelated setting.
test('a valid project config is merged, not replaced', async (t) => {
  const root = await makeTmpDir(t, 'zames-cfgok-')
  const file = path.join(root, '.zamesrc.json')
  fs.writeFileSync(file, JSON.stringify({ maxIterations: 5 }))
  const out = writeTo(file, 'ui.locale', 'en') as {
    ok: boolean
    parsed?: Record<string, unknown>
  }
  assert.equal(out.ok, true)
  assert.equal(out.parsed?.maxIterations, 5)
  assert.deepEqual(out.parsed?.ui, { locale: 'en' })
})
