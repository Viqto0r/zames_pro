import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLiveThemeCommand, isLiveConfigCommand } from '../src/commands.ts'

// A theme switch is a PURE repaint: it must work WHILE the agent is generating,
// exactly like `/config set`, without queueing the operator's line until the
// task ends. The bare `/theme` (pick list) is different — it pauses the editor
// and must stay queued, or it would fight the running task.

test('/theme <id> is handled live (mid-run)', () => {
  assert.ok(isLiveThemeCommand('/theme dracula'))
  assert.ok(isLiveThemeCommand('  /theme one-light  '))
  assert.ok(isLiveThemeCommand('/THEME solarized-dark'))
  assert.ok(isLiveThemeCommand('/theme list'))
})

test('the bare /theme (pick list) is NOT live', () => {
  assert.ok(!isLiveThemeCommand('/theme'))
  assert.ok(!isLiveThemeCommand('/theme   '))
  assert.ok(!isLiveThemeCommand('/themes dracula'))
  assert.ok(!isLiveThemeCommand('theme dracula'))
})

test('/config set stays live, the menu does not (unchanged contract)', () => {
  assert.ok(isLiveConfigCommand('/config set ui.theme dracula'))
  assert.ok(!isLiveConfigCommand('/config'))
  assert.ok(!isLiveConfigCommand('/config menu'))
})
