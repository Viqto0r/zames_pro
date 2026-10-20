import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHandoffText } from '../src/provider-handoff.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

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
test('readProviderHandoff matches the same directory reached differently', async (t) => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const home = makeTmpDirSync(t, 'zames-ho-home-')
  const prevHome = process.env.HOME
  const prevProfile = process.env.USERPROFILE
  process.env.HOME = home
  process.env.USERPROFILE = home
  const { saveProviderHandoff, readProviderHandoff, clearProviderHandoff } =
    await import('../src/provider-handoff.ts')
  const wd = makeTmpDirSync(t, 'zames-ho-wd-')
  try {
    saveProviderHandoff({
      provider: 'qwen',
      workdir: wd + path.sep,
      summary: 'carried over',
      createdAt: new Date().toISOString(),
    })
    // Trailing separator on the STORED side.
    assert.equal(readProviderHandoff('qwen', wd)?.summary, 'carried over')

    // A symlink to the same directory must match too.
    const link = path.join(home, 'link')
    fs.symlinkSync(wd, link)
    assert.equal(readProviderHandoff('qwen', link)?.summary, 'carried over')
    // A different directory still must NOT match.
    const other = makeTmpDirSync(t, 'zames-ho-other-')
    assert.equal(readProviderHandoff('qwen', other), null)
  } finally {
    clearProviderHandoff()
    process.env.HOME = prevHome
    process.env.USERPROFILE = prevProfile
  }
})
