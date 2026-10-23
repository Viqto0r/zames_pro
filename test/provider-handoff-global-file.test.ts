import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { makeTmpDirSync } from './tmp-dir.ts'

// The handoff is stored in ONE global file (~/.zames/provider-handoff.json),
// and `saveProviderHandoff` overwrites whatever is there. The operator may
// switch providers in project A and then again in project B; the second save
// must NOT replace the first (A's context was never consumed).
//
// `provider-handoff.ts` resolves ~/.zames ONCE, at import time, so a
// `process.env.HOME` swap inside a test cannot redirect it — the test would
// then share the REAL ~/.zames file with the other handoff tests and fail
// intermittently in a full run. The module is exercised in a CHILD PROCESS
// with HOME already pointed at a throwaway dir.
test('a save for another workdir does not overwrite a pending handoff', (t) => {
  const home = makeTmpDirSync(t, 'zames-ph-home-')
  const a = makeTmpDirSync(t, 'zames-ph-a-')
  const b = makeTmpDirSync(t, 'zames-ph-b-')
  const script = [
    "import { saveProviderHandoff, readProviderHandoff } from './src/provider-handoff.ts'",
    'const a = process.argv[1]',
    'const b = process.argv[2]',
    "saveProviderHandoff({ provider: 'qwen', workdir: a, summary: 'from project A', createdAt: new Date().toISOString() })",
    "saveProviderHandoff({ provider: 'qwen', workdir: b, summary: 'from project B', createdAt: new Date().toISOString() })",
    "const got = readProviderHandoff('qwen', a)",
    'console.log(JSON.stringify({ summary: got ? got.summary : null }))',
  ].join(String.fromCharCode(10))
  const res = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script, a, b],
    {
      cwd: process.cwd(),
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf-8',
      timeout: 60_000,
    },
  )
  assert.equal(res.status, 0, res.stderr || '')
  const lines = String(res.stdout || '{}')
    .trim()
    .split(String.fromCharCode(10))
  const out = JSON.parse(lines[lines.length - 1] || '{}')
  assert.equal(out.summary, 'from project A')
})
