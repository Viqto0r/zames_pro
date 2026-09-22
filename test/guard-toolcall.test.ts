import { test } from 'node:test'
import assert from 'node:assert/strict'
import { responseLooksLikeToolCall } from '../src/agent-loop.ts'

// Safeguard against "called a tool and stopped": if parseToolCall did not
// recognize the answer but it looks like a call — the agent must re-ask, not
// finish the task. The test pins down which forms count as "looks like a call".

test('ловит нормальный JSON-вызов', () => {
  assert.equal(
    responseLooksLikeToolCall('{"tool": "Bash", "args": {"command": "ls"}}'),
    true,
  )
})

test('ловит поломанную голову <｜tool": (реальный кейс остановки)', () => {
  assert.equal(
    responseLooksLikeToolCall(
      '<\uFF5Ctool": "Bash", "args": {"command": "echo hi"}',
    ),
    true,
  )
})

test('ловит tool": без открывающей кавычки', () => {
  assert.equal(responseLooksLikeToolCall('tool": "Read", "args": {}'), true)
})

test('ловит markdown **tool**:', () => {
  assert.equal(responseLooksLikeToolCall('**tool**: "Bash"'), true)
})

test('ловит XML/DSML-формы', () => {
  assert.equal(
    responseLooksLikeToolCall(
      '<\uFF5C\uFF5CDSML\uFF5C\uFF5Cinvoke name="Read">',
    ),
    true,
  )
  assert.equal(
    responseLooksLikeToolCall('<invoke name="Read"><parameter name="path">'),
    true,
  )
})

test('ловит обрезанный вызов (есть command/args, нет закрытия)', () => {
  assert.equal(
    responseLooksLikeToolCall('{"tool": "Bash", "args": {"command": "ls'),
    true,
  )
})

test('НЕ ловит обычный финальный текст', () => {
  assert.equal(responseLooksLikeToolCall('Готово, все тесты прошли.'), false)
  assert.equal(responseLooksLikeToolCall('The task is done.'), false)
  assert.equal(responseLooksLikeToolCall(''), false)
})

test('НЕ ловит прозу с path:/command: без JSON-объекта', () => {
  assert.equal(
    responseLooksLikeToolCall('Файл лежит тут, path: src/index.ts, всё ок.'),
    false,
  )
  assert.equal(
    responseLooksLikeToolCall('Команда выполнена: command: npm test прошёл.'),
    false,
  )
})
