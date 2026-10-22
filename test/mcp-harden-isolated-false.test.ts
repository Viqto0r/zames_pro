// hardenPlaywrightArgs() auto-adds `--isolated` to a @playwright/mcp server so
// it never shares ~/.zames/profile with the live agent. The "the operator
// already chose a profile" check matched a PREFIX: `--isolated=false` (a
// legitimate explicit request for a PERSISTENT profile) starts with
// '--isolated', so the hardener decided the profile was handled and added
// nothing — and the MCP browser then opened the agent's live profile, the
// exact conflict the guard exists to prevent.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hardenPlaywrightArgs } from '../src/mcp.ts'

test('--isolated=false is NOT treated as the isolated flag', () => {
  const out = hardenPlaywrightArgs('npx', [
    '@playwright/mcp',
    '--isolated=false',
  ])
  assert.ok(out.includes('--isolated'), JSON.stringify(out))
})

test('a real --isolated still stops the hardener', () => {
  const out = hardenPlaywrightArgs('npx', ['@playwright/mcp', '--isolated'])
  assert.equal(out.filter((a) => a === '--isolated').length, 1)
})

test('--user-data-dir still counts as an explicit profile', () => {
  const out = hardenPlaywrightArgs('npx', [
    '@playwright/mcp',
    '--user-data-dir',
    '/x',
  ])
  assert.equal(out.includes('--isolated'), false)
})

test('--user-data-dir=/x still counts', () => {
  const out = hardenPlaywrightArgs('npx', [
    '@playwright/mcp',
    '--user-data-dir=/x',
  ])
  assert.equal(out.includes('--isolated'), false)
})
