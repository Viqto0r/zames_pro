// Unit tests for the PURE tool-call summarizer (src/tool-summary.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeToolCall } from '../src/tool-summary.js'

test('summarizeToolCall: Read/Write/Edit -> путь', () => {
  assert.deepEqual(summarizeToolCall('Read', { path: 'a/b.ts' }), {
    name: 'Read',
    detail: 'a/b.ts',
  })
  assert.deepEqual(summarizeToolCall('Edit', { file_path: 'x.ts' }), {
    name: 'Edit',
    detail: 'x.ts',
  })
})

test('summarizeToolCall: Bash -> команда одной строкой', () => {
  assert.deepEqual(
    summarizeToolCall('Bash', { command: 'npm test\n  --watch' }),
    { name: 'Bash', detail: 'npm test --watch' },
  )
})

test('summarizeToolCall: Grep -> /pattern/ path', () => {
  assert.equal(
    summarizeToolCall('Grep', { pattern: 'foo', path: 'src' }).detail,
    '/foo/ src',
  )
})

test('summarizeToolCall: Task -> description', () => {
  assert.equal(
    summarizeToolCall('Task', { description: 'explore x', prompt: 'long...' })
      .detail,
    'explore x',
  )
})

test('summarizeToolCall: неизвестный тул -> JSON аргументов', () => {
  const s = summarizeToolCall('Custom', { a: 1 })
  assert.equal(s.name, 'Custom')
  assert.match(s.detail, /\{.*"a".*1.*\}/)
})

test('summarizeToolCall: пустые аргументы -> пустой detail', () => {
  assert.equal(summarizeToolCall('Read', {}).detail, '')
  assert.equal(summarizeToolCall('Custom', {}).detail, '')
})

test('summarizeToolCall: обрезает длинное значение', () => {
  const long = 'x'.repeat(300)
  const s = summarizeToolCall('Bash', { command: long })
  assert.ok(s.detail.length <= 80)
  assert.ok(s.detail.endsWith('…'))
})

test('summarizeToolCall: LS/Glob -> путь или pattern', () => {
  assert.equal(summarizeToolCall('LS', { path: 'src' }).detail, 'src')
  assert.equal(
    summarizeToolCall('Glob', { pattern: '**/*.ts' }).detail,
    '**/*.ts',
  )
  assert.equal(summarizeToolCall('LS', {}).detail, '.')
})

test('summarizeToolCall: Write/MultiEdit -> путь', () => {
  assert.equal(summarizeToolCall('Write', { path: 'w.ts' }).detail, 'w.ts')
  assert.equal(
    summarizeToolCall('MultiEdit', { file_path: 'm.ts' }).detail,
    'm.ts',
  )
})

test('summarizeToolCall: Grep без pattern', () => {
  assert.equal(summarizeToolCall('Grep', { path: 'src' }).detail, 'src')
  assert.equal(summarizeToolCall('Grep', {}).detail, '')
})

test('summarizeToolCall: Task/TodoWrite/respond', () => {
  assert.equal(summarizeToolCall('Task', { prompt: 'p' }).detail, 'p')
  assert.equal(
    summarizeToolCall('TodoWrite', { todos: [1, 2, 3] }).detail,
    '3 items',
  )
  assert.equal(summarizeToolCall('TodoWrite', {}).detail, '')
  assert.equal(
    summarizeToolCall('respond', { message: 'final answer' }).detail,
    'final answer',
  )
})

test('summarizeToolCall: null-ish аргументы не роняют', () => {
  // @ts-expect-error runtime guard: a caller may pass null
  assert.equal(summarizeToolCall('Read', null).detail, '')
})
