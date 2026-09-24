import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseToolCall } from '../src/agent-loop.ts'

const NL = String.fromCharCode(10)
const Q = String.fromCharCode(34)

function call(tool: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool, args })
}
function first(res: unknown): { tool: string; args: Record<string, unknown> } {
  return (Array.isArray(res) ? res[0] : res) as {
    tool: string
    args: Record<string, unknown>
  }
}

test('чистый JSON распознаётся', () => {
  const res = parseToolCall(call('Read', { path: 'a.js' }))
  assert.ok(res)
  assert.equal(first(res).tool, 'Read')
  assert.deepEqual(first(res).args, { path: 'a.js' })
})

test('JSON в markdown-блоке распознаётся', () => {
  const res = parseToolCall('`json' + NL + call('Read', { path: 'a.js' }) + NL + '`')
  assert.ok(res)
  assert.equal(first(res).tool, 'Read')
})

test('JSON в прозе распознаётся', () => {
  const res = parseToolCall('Сейчас прочитаю. ' + call('Read', { path: 'a.js' }) + ' Готово.')
  assert.ok(res)
  assert.equal(first(res).tool, 'Read')
})

test('массив вызовов распознаётся', () => {
  const res = parseToolCall(
    JSON.stringify([
      { tool: 'Read', args: { path: 'a.js' } },
      { tool: 'Read', args: { path: 'b.js' } },
    ]),
  )
  assert.ok(Array.isArray(res))
  assert.equal((res as unknown[]).length, 2)
})

test('обычный текст не считается tool-call', () => {
  assert.equal(parseToolCall('Привет! Чем помочь?'), null)
  assert.equal(parseToolCall(''), null)
  assert.equal(parseToolCall('{ broken json'), null)
})

test('Write с многострочным content распознаётся', () => {
  const content = 'a' + NL + 'b' + NL + 'c'
  const res = parseToolCall(call('Write', { path: 'f.txt', content }))
  assert.ok(res)
  assert.equal(first(res).args['content'], content)
})

test('Bash с кавычками внутри команды распознаётся', () => {
  const text =
    '{' + Q + 'tool' + Q + ': ' + Q + 'Bash' + Q + ', ' + Q + 'args' + Q + ': {' +
    Q + 'command' + Q + ': ' + Q + 'echo ' + Q + 'hi' + Q + ' && ls' + Q + '}}'
  const res = parseToolCall(text)
  assert.ok(res)
  assert.equal(first(res).tool, 'Bash')
  assert.equal(first(res).args['command'], 'echo ' + Q + 'hi' + Q + ' && ls')
})

test('Edit с сырым переводом строки в new_string распознаётся', () => {
  const text =
    '{' + Q + 'tool' + Q + ': ' + Q + 'Edit' + Q + ', ' + Q + 'args' + Q + ': {' +
    Q + 'path' + Q + ': ' + Q + 'x.js' + Q + ', ' +
    Q + 'old_string' + Q + ': ' + Q + 'foo' + Q + ', ' +
    Q + 'new_string' + Q + ': ' + Q + 'line1' + NL + 'line2' + Q + '}}'
  const res = parseToolCall(text)
  assert.ok(res)
  assert.equal(first(res).tool, 'Edit')
  assert.equal(first(res).args['new_string'], 'line1' + NL + 'line2')
  assert.equal(first(res).args['old_string'], 'foo')
})

test('одинарные кавычки в псевдо-JSON распознаются', () => {
  const SQ = String.fromCharCode(39)
  const text =
    '{' + SQ + 'tool' + SQ + ': ' + SQ + 'Read' + SQ + ', ' +
    SQ + 'args' + SQ + ': {' + SQ + 'path' + SQ + ': ' + SQ + 'src/undo.ts' + SQ + '}}'
  const res = parseToolCall(text)
  assert.ok(res, 'должен распознаться вызов, а не финальный текст')
  assert.equal(first(res).tool, 'Read')
  assert.equal(first(res).args['path'], 'src/undo.ts')
})

test('ключи без кавычек в псевдо-JSON распознаются', () => {
  const text = '{tool: ' + Q + 'Read' + Q + ', args: {' + Q + 'path' + Q + ': ' + Q + 'a.ts' + Q + '}}'
  const res = parseToolCall(text)
  assert.ok(res)
  assert.equal(first(res).tool, 'Read')
  assert.equal(first(res).args['path'], 'a.ts')
})

test('XML/DSML-вызов распознаётся', () => {
  const text =
    '<|DSML|invoke name=' + Q + 'Read' + Q + '>' +
    '<|DSML|parameter name=' + Q + 'path' + Q + '>c.js</|DSML|parameter>' +
    '</|DSML|invoke>'
  const res = parseToolCall(text)
  assert.ok(res)
  assert.equal(first(res).tool, 'Read')
  assert.equal(first(res).args['path'], 'c.js')
})

test('XML-вызов с одним parameter args разворачивается', () => {
  const text =
    '<invoke name=' + Q + 'Read' + Q + '>' +
    '<parameter name=' + Q + 'args' + Q + ' string=' + Q + 'false' + Q + '>' +
    JSON.stringify({ path: 'd.js' }) +
    '</parameter></invoke>'
  const res = parseToolCall(text)
  assert.ok(res)
  assert.equal(first(res).args['path'], 'd.js')
})

test('несколько XML-вызовов возвращаются массивом', () => {
  const one =
    '<invoke name=' + Q + 'Read' + Q + '>' +
    '<parameter name=' + Q + 'path' + Q + '>a.js</parameter></invoke>'
  const two =
    '<invoke name=' + Q + 'Read' + Q + '>' +
    '<parameter name=' + Q + 'path' + Q + '>b.js</parameter></invoke>'
  const res = parseToolCall(one + two)
  assert.ok(Array.isArray(res))
  assert.equal((res as unknown[]).length, 2)
})

test('несколько JSON-вызовов подряд возвращаются массивом', () => {
  // Regression: the model often emits several separate {"tool": ...} objects
  // instead of one array. Only the first used to be returned, so the rest were
  // dropped and the agent could "stall after a tool call" with pending work.
  const res = parseToolCall(
    call('Read', { path: 'a.js' }) + NL + call('Edit', { path: 'b.js' }),
  )
  assert.ok(Array.isArray(res))
  assert.equal((res as unknown[]).length, 2)
  assert.equal((res as Array<{ tool: string }>)[0].tool, 'Read')
  assert.equal((res as Array<{ tool: string }>)[1].tool, 'Edit')
})

test('JSON-вызовы, разделённые прозой, собираются все', () => {
  const res = parseToolCall(
    'Сначала прочитаю. ' +
      call('Read', { path: 'a.js' }) +
      NL +
      'Теперь запишу. ' +
      call('Write', { path: 'b.js', content: 'x' }),
  )
  assert.ok(Array.isArray(res))
  const tools = (res as Array<{ tool: string }>).map((c) => c.tool)
  assert.deepEqual(tools, ['Read', 'Write'])
})

test('inline-args без обёртки "args" распознаётся (реальный кейс)', () => {
  // Модель положила ключи аргументов рядом с "tool", без "args":
  // {"tool": "Bash", "command_note": "", "command": "git push ..."}}
  // Строгий парсер такое отвергал (нет obj.args), а permissive выходил
  // раньше времени (indexOf('"args"') === -1) — вызов считался malformed.
  const res = parseToolCall(
    '{"tool": "Bash", "command_note": "", "command": "git push origin master"}}',
  )
  assert.ok(res, 'вызов должен распознаваться')
  const c = first(res)
  assert.equal(c.tool, 'Bash')
  assert.equal(c.args.command, 'git push origin master')
})

test('inline-args: числа и булевы значения приводятся', () => {
  const res = parseToolCall(
    '{"tool": "Read", "path": "src/index.ts", "offset": 10, "limit": 20}',
  )
  assert.ok(res)
  const c = first(res)
  assert.equal(c.tool, 'Read')
  assert.equal(c.args.offset, 10)
  assert.equal(c.args.limit, 20)
})

test('inline-args не ломает обычный вызов с "args"', () => {
  const res = parseToolCall(call('Bash', { command: 'ls' }))
  assert.ok(res)
  const c = first(res)
  assert.equal(c.tool, 'Bash')
  assert.equal(c.args.command, 'ls')
})
