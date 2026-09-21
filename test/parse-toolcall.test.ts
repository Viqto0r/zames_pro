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
