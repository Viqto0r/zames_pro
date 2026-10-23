import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  saveProviderHandoff,
  readProviderHandoff,
  clearProviderHandoff,
} from '../src/provider-handoff.ts'

const HOME_DIR = path.join(os.homedir(), '.zames')

function cleanup(): void {
  try {
    for (const f of fs.readdirSync(HOME_DIR)) {
      if (f.startsWith('provider-handoff')) {
        fs.rmSync(path.join(HOME_DIR, f), { force: true })
      }
    }
  } catch {}
}

// A handoff is consumed ONCE (`clearProviderHandoff` removes only the GLOBAL
// file). When project A's record had been displaced to its SIDE file by a
// later switch in project B, that side file survived the consumption: on the
// next switch in A the OLD summary was posted again as carried-over context —
// "the summary came back from the dead" and the model was told history that
// had already been consumed. A consumed handoff must leave no readable copy.
test('a consumed side-file handoff does not come back', (t) => {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-ha-'))
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-hb-'))
  t.after(() => {
    cleanup()
    fs.rmSync(a, { recursive: true, force: true })
    fs.rmSync(b, { recursive: true, force: true })
  })
  cleanup()
  // Project A switches -> its handoff is written to the global file.
  saveProviderHandoff({
    provider: 'qwen',
    from: 'deepseek',
    workdir: a,
    summary: 'A-old',
    createdAt: new Date().toISOString(),
  })
  // Project B switches later: A's record is moved to a side file.
  saveProviderHandoff({
    provider: 'qwen',
    from: 'deepseek',
    workdir: b,
    summary: 'B',
    createdAt: new Date().toISOString(),
  })
  // B consumes its handoff (the global file is removed).
  clearProviderHandoff()
  assert.equal(readProviderHandoff('qwen', b), null)
  // Now a NEW switch happens in B; the save displaces whatever the global
  // file holds and then A's side file must still not resurface.
  saveProviderHandoff({
    provider: 'qwen',
    from: 'deepseek',
    workdir: b,
    summary: 'B2',
    createdAt: new Date().toISOString(),
  })
  assert.equal(readProviderHandoff('qwen', a), null)
})
