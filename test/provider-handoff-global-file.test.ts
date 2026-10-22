import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  saveProviderHandoff,
  readProviderHandoff,
} from '../src/provider-handoff.ts'
import { makeTmpDir } from './tmp-dir.ts'

// The handoff is stored in ONE global file (~/.zames/provider-handoff.json),
// and `saveProviderHandoff` overwrites whatever is there. The operator may
// switch providers in project A and then again in project B; the second save
// replaced the first, so project A's carried-over context was lost even though
// it had never been consumed.
test('a save for another workdir does not overwrite a pending handoff', async (t) => {
  const fakeHome = await makeTmpDir(t, 'zames-ph-home-')
  const prevHome = process.env.HOME
  process.env.HOME = fakeHome
  const mod = await import(
    '../src/provider-handoff.ts?fresh=' + Math.random().toString(36).slice(2)
  )
  try {
    const a = await makeTmpDir(t, 'zames-ph-a-')
    const b = await makeTmpDir(t, 'zames-ph-b-')
    mod.saveProviderHandoff({
      provider: 'qwen',
      workdir: a,
      summary: 'from project A',
      createdAt: new Date().toISOString(),
    })
    mod.saveProviderHandoff({
      provider: 'qwen',
      workdir: b,
      summary: 'from project B',
      createdAt: new Date().toISOString(),
    })
    const got = mod.readProviderHandoff('qwen', a)
    assert.ok(got, 'project A handoff was overwritten by the project B one')
    assert.equal(got.summary, 'from project A')
  } finally {
    process.env.HOME = prevHome
  }
  void saveProviderHandoff
  void readProviderHandoff
})
