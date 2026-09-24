import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
 jsonSchemaToParams,
 renderMcpResult,
 qualifyToolName,
 normalizeServerConfig,
 describeParamsExternally,
 hardenPlaywrightArgs,
} from '../src/mcp.ts'

test('jsonSchemaToParams: обязательные и опциональные поля', () => {
 const params = jsonSchemaToParams({
 type: 'object',
 properties: {
 url: { type: 'string' },
 count: { type: 'number' },
 flag: { type: 'boolean' },
 mode: { enum: ['a', 'b'] },
 },
 required: ['url'],
 })
 assert.deepEqual(params, {
 url: 'string',
 count: 'number?',
 flag: 'boolean?',
 mode: 'value?',
 })
})

test('jsonSchemaToParams: пустая/битая схема не падает', () => {
 assert.deepEqual(jsonSchemaToParams(null), {})
 assert.deepEqual(jsonSchemaToParams({}), {})
 assert.deepEqual(jsonSchemaToParams('nope'), {})
})

test('qualifyToolName: префикс сервера и безопасные символы', () => {
 assert.equal(qualifyToolName('playwright', 'browser_navigate'), 'playwright__browser_navigate')
 assert.equal(qualifyToolName('srv', 'a-b.c'), 'srv__a_b_c')
})

test('renderMcpResult: текст, ошибка, картинка', () => {
 assert.equal(renderMcpResult({ content: [{ type: 'text', text: 'hi' }] }), 'hi')
 assert.equal(
 renderMcpResult({ content: [{ type: 'text', text: 'boom' }], isError: true }),
 'MCP error: boom',
 )
 assert.match(renderMcpResult({ content: [{ type: 'image', mimeType: 'image/png' }] }), /^\[image/)
 assert.equal(
 renderMcpResult({ content: [{ type: 'resource', resource: { uri: 'file://x', text: 'body' } }] }),
 'file://x' + String.fromCharCode(10) + 'body',
 )
})

test('renderMcpResult: пустой результат не пустая строка', () => {
 assert.ok(renderMcpResult({ content: [] }).length > 0)
 assert.ok(renderMcpResult({ toolResult: 'x' }) === 'x')
})

test('normalizeServerConfig: command/url и отбраковка мусора', () => {
 assert.equal(normalizeServerConfig({ command: 'npx', args: ['-y', 'x'] })?.command, 'npx')
 assert.equal(normalizeServerConfig({}), null)
 assert.equal(normalizeServerConfig(null), null)
 assert.equal(normalizeServerConfig({ url: 'https://x', transport: 'sse' })?.transport, 'sse')
 assert.equal(normalizeServerConfig({ url: 'https://x', transport: 'bogus' })?.transport, undefined)
 assert.equal(normalizeServerConfig({ command: 'x', disabled: true })?.disabled, true)
})

test('describeParamsExternally: схема попадает в описание', () => {
 const s = describeParamsExternally('Do a thing', {
 type: 'object',
 properties: { url: { type: 'string', description: 'The URL' } },
 })
 assert.ok(s.startsWith('Do a thing'))
 assert.ok(s.includes('JSON Schema'))
 assert.ok(s.includes('The URL'))
})

test('hardenPlaywrightArgs: playwright MCP всегда изолируется', () => {
  const base = ['-y', '@playwright/mcp@latest', '--headless']
  assert.deepEqual(hardenPlaywrightArgs('npx', base), [...base, '--isolated'])
  // Уже заданный профиль не трогаем.
  const iso = [...base, '--isolated']
  assert.deepEqual(hardenPlaywrightArgs('npx', iso), iso)
  const udd = [...base, '--user-data-dir', '/tmp/p']
  assert.deepEqual(hardenPlaywrightArgs('npx', udd), udd)
  // Не-playwright сервер не трогаем.
  assert.deepEqual(hardenPlaywrightArgs('node', ['server.js']), ['server.js'])
})
