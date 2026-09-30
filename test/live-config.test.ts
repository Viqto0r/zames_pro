import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLiveConfigCommand } from '../src/commands.ts'

test('isLiveConfigCommand: text subcommands are live', () => {
  assert.equal(isLiveConfigCommand('/config list'), true)
  assert.equal(isLiveConfigCommand('/config get ui.locale'), true)
  assert.equal(isLiveConfigCommand('/config set ui.locale en'), true)
  assert.equal(isLiveConfigCommand('/config reset ui.locale'), true)
  assert.equal(isLiveConfigCommand('/config lang ru'), true)
  assert.equal(isLiveConfigCommand('/config path'), true)
})

test('isLiveConfigCommand: bare and menu are NOT live', () => {
  assert.equal(isLiveConfigCommand('/config'), false)
  assert.equal(isLiveConfigCommand('/config menu'), false)
  assert.equal(isLiveConfigCommand('/config ui'), false)
})

test('isLiveConfigCommand: non-config lines are rejected', () => {
  assert.equal(isLiveConfigCommand('/queue'), false)
  assert.equal(isLiveConfigCommand('config list'), false)
  assert.equal(isLiveConfigCommand(''), false)
})
