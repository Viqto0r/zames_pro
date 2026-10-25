import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hardenPlaywrightArgs } from '../src/mcp.ts'

// @playwright/mcp defaults its profile to the agent's OWN ~/.zames/profile, so
// the hardener appends --isolated. A user who writes `--user-data-dir` with a
// SEPARATE value (the documented way to keep the MCP browser apart) must not
// get a second profile flag: two `--user-data-dir` values make the server use
// one of them unpredictably, and `--isolated` together with a profile is
// contradictory (in-memory vs on-disk). Both spellings must count: the flag and
// its value as TWO args, and the flag glued to the value with `=` INSIDE the
// command string (a wrapper such as
// `npx --user-data-dir=/x @playwright/mcp`), which the guard used to miss.
test('a profile flag inside the command is respected', () => {
  const args = hardenPlaywrightArgs(
    'npx --user-data-dir=/tmp/mcp-profile @playwright/mcp@1.2.3',
    [],
  )
  assert.deepEqual(args, [])
})

test('a plain playwright mcp still gets --isolated', () => {
  assert.deepEqual(hardenPlaywrightArgs('npx', ['@playwright/mcp@latest']), [
    '@playwright/mcp@latest',
    '--isolated',
  ])
})

test('--isolated=false does not count as isolated', () => {
  assert.deepEqual(
    hardenPlaywrightArgs('npx', ['--isolated=false', '@playwright/mcp']),
    ['--isolated=false', '@playwright/mcp', '--isolated'],
  )
})
