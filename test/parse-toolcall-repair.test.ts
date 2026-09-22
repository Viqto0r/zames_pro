import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseToolCall } from '../src/agent-loop.ts'

// Regression: DeepSeek sometimes "breaks the head" of a call — it loses the
// opening `{` and the first quote of the key, adds a junk prefix (`<｜`, `**`, `- `).
// Previously such an answer was not recognized, and the agent silently stalled
// after a tool call (assistant_final instead of tool_call).

test('восстанавливает <｜tool": ... без открывающей скобки', () => {
  const p = parseToolCall(
    '<\uFF5Ctool": "Bash", "args": {"command": "echo hi"}',
  )
  assert.ok(p)
  const call = Array.isArray(p) ? p[0] : p
  assert.equal(call.tool, 'Bash')
  assert.deepEqual(call.args, { command: 'echo hi' })
})

test('восстанавливает tool": ... (потеряна открывающая кавычка)', () => {
  const p = parseToolCall('tool": "Read", "args": {"path": "a.txt"}')
  assert.ok(p)
  const call = Array.isArray(p) ? p[0] : p
  assert.equal(call.tool, 'Read')
  assert.deepEqual(call.args, { path: 'a.txt' })
})

test('repairs **tool**: ... (markdown wrapper)', () => {
  const p = parseToolCall('**tool**: "Bash", "args": {"command": "ls"}')
  assert.ok(p)
  const call = Array.isArray(p) ? p[0] : p
  assert.equal(call.tool, 'Bash')
  assert.deepEqual(call.args, { command: 'ls' })
})

test('восстанавливает - tool: ... (список)', () => {
  const p = parseToolCall('- tool: "Bash", "args": {"command": "pwd"}')
  assert.ok(p)
  const call = Array.isArray(p) ? p[0] : p
  assert.equal(call.tool, 'Bash')
})

test('обычный JSON по-прежнему парсится без _permissive', () => {
  const p = parseToolCall('{"tool": "Bash", "args": {"command": "echo hi"}}')
  assert.ok(p)
  const call = Array.isArray(p) ? p[0] : p
  assert.equal(call.tool, 'Bash')
  assert.ok(!call._permissive)
})

test('не ломает обычный текст без вызова', () => {
  assert.equal(parseToolCall('Готово, все тесты прошли.'), null)
  assert.equal(parseToolCall('The task is done.'), null)
})
