import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseToolCall } from '../src/agent-loop.ts'

// Регрессия: DeepSeek иногда «ломает голову» вызова — теряет открывающую
// `{` и первую кавычку ключа, добавляет мусорный префикс (`<｜`, `**`, `- `).
// Раньше такой ответ не распознавался, агент молча вставал после вызова
// инструмента (assistant_final вместо tool_call).

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

test('восстанавливает **tool**: ... (markdown-обёртка)', () => {
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
