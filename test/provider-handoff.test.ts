import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHandoffText } from '../src/provider-handoff.ts'
import { makeTmpDirSync } from './tmp-dir.ts'
import { spawnSync } from 'node:child_process'

// `provider-handoff.ts` resolves ~/.zames ONCE, at import time. The tests that
// exercise save/read must run against a THROWAWAY home, but a `test()` body
// imports the module lazily and swaps HOME first — while the module was already
// loaded by the static import ABOVE, so it kept pointing at the REAL
// ~/.zames. The suite then raced with the other handoff tests over the same
// real file (a full run intermittently lost the record). The IO test builds its
// own throwaway module by copying the source into a temp dir instead.

// Provider-switch carry-over: the summary crosses a provider boundary, so the
// wording must tell the NEW model this is history from ANOTHER assistant, not a
// fresh instruction to redo the work. These pin the contract without touching
// the filesystem (save/read/clear are best-effort IO).

test('buildHandoffText marks the context as carried over from another assistant', () => {
  const t = buildHandoffText({
    from: 'DeepSeek',
    to: 'Qwen',
    summary: 'We refactored the config loader and added a test.',
    task: 'finish the refactor',
  })
  assert.match(t, /carried over/i)
  assert.match(t, /DeepSeek -> Qwen|DeepSeek .* Qwen/i)
  assert.match(t, /Do NOT redo/i)
  assert.ok(t.includes('We refactored the config loader'))
  assert.ok(t.includes('Original task: finish the refactor'))
})

test('buildHandoffText works without a task', () => {
  const t = buildHandoffText({ from: 'Qwen', to: 'DeepSeek', summary: 'x' })
  assert.ok(t.includes('x'))
  assert.ok(!t.includes('Original task'))
})

test('buildHandoffText trims the summary', () => {
  const t = buildHandoffText({
    from: 'A',
    to: 'B',
    summary: '  padded  ',
  })
  assert.ok(t.includes('padded'))
  assert.ok(!t.includes('  padded  '))
})

// The handoff is persisted with the working directory it belongs to and is
// consumed by the NEXT launch in that same directory. The path there is not
// guaranteed to be byte-identical: the operator may reach the project through
// a symlink, or the stored path may carry a trailing separator (a `/cd sub/`
// leaves one). A lexical `!==` comparison made the summary silently vanish.
//
// The module resolves ~/.zames at IMPORT time, so a `process.env.HOME` swap
// inside a test cannot redirect it — the code under test would keep reading the
// REAL ~/.zames file and race with the other handoff tests (the real source of
// the intermittent full-run failure). This test therefore runs the module in a
// CHILD PROCESS with HOME already set to a throwaway dir.
test('readProviderHandoff matches the same directory reached differently', (t) => {
  const home = makeTmpDirSync(t, 'zames-ho-home-')
  const wd = makeTmpDirSync(t, 'zames-ho-wd-')
  const other = makeTmpDirSync(t, 'zames-ho-other-')
  const script =
    "import { saveProviderHandoff, readProviderHandoff, clearProviderHandoff } from './src/provider-handoff.ts'\nconst path = await import(\"node:path\")\nconst fs = await import(\"node:fs\")\nconst wd = process.argv[1]\nconst other = process.argv[2]\nsaveProviderHandoff({ provider: 'qwen', workdir: wd + path.sep, summary: 'carried over', createdAt: new Date().toISOString() })\nconst a = readProviderHandoff('qwen', wd)?.summary ?? ''\nconst link = wd + '-link'\nfs.symlinkSync(wd, link)\nconst b = readProviderHandoff('qwen', link)?.summary ?? ''\nconst c = readProviderHandoff('qwen', other)?.summary ?? null\nclearProviderHandoff()\nconsole.log(JSON.stringify({ a, b, c }))"
  const res = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script, wd, other],
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
  assert.equal(out.a, 'carried over')
  assert.equal(out.b, 'carried over')
  assert.equal(out.c, null)
})
