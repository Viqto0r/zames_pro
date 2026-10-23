import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDirSync } from './tmp-dir.ts'

// A DISPLACED handoff must survive an unrelated save. `saveProviderHandoff`
// parks a pending record of ANOTHER workdir in a per-workdir SIDE file, but
// the very next save (whatever project it belongs to) used to check only the
// GLOBAL file: when that file already held a record of the SAME workdir it
// simply overwrote it, and the SIDE file was replaced by an identical pending
// copy of `h` — the parked summary of another project was erased without ever
// being consumed. A later switch in that project then found nothing, and the
// carried-over context was silently lost.
//
// `provider-handoff.ts` resolves ~/.zames ONCE at import time, so the module
// is exercised in a CHILD PROCESS with HOME pointed at a throwaway dir.
test('a save for one workdir keeps a displaced handoff of another', (t) => {
  const home = makeTmpDirSync(t, 'zames-hx-home-')
  const a = makeTmpDirSync(t, 'zames-hx-a-')
  const b = makeTmpDirSync(t, 'zames-hx-b-')
  const zhome = path.join(home, '.zames')
  fs.mkdirSync(zhome, { recursive: true })
  const record = (workdir: string, summary: string): string =>
    JSON.stringify({
      provider: 'qwen',
      from: 'deepseek',
      workdir,
      summary,
      createdAt: new Date().toISOString(),
    })
  // Project B already has a handoff, but the GLOBAL file currently holds A's.
  const sideB = path.join(
    zhome,
    'provider-handoff-' + Buffer.from(b).toString('base64url') + '.json',
  )
  fs.writeFileSync(sideB, record(b, 'B-pending'))
  fs.writeFileSync(path.join(zhome, 'provider-handoff.json'), record(a, 'A'))

  const script = [
    "import { saveProviderHandoff, readProviderHandoff } from './src/provider-handoff.ts'",
    'const a = process.argv[1]',
    'const b = process.argv[2]',
    "saveProviderHandoff({ provider: 'qwen', from: 'deepseek', workdir: a, summary: 'A2', createdAt: new Date().toISOString() })",
    "const got = readProviderHandoff('qwen', b)",
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
  assert.equal(out.summary, 'B-pending')
})
