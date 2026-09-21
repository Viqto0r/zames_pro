import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractFromSse,
  extractFromJson,
  extractAnswer,
} from '../src/net-capture.ts'

const NL = String.fromCharCode(10)
const D = String.fromCharCode(36)
const BS = String.fromCharCode(92)

function sseChunk(obj: unknown): string {
  return 'data: ' + JSON.stringify(obj) + NL
}

test('SSE: склеивает чанки delta.content в финальный текст', () => {
  const body =
    sseChunk({ choices: [{ delta: { content: 'Привет' } }] }) +
    sseChunk({ choices: [{ delta: { content: ', мир' } }] }) +
    'data: [DONE]' +
    NL
  assert.equal(extractFromSse(body), 'Привет, мир')
})

test('SSE: reasoning_content не попадает в ответ', () => {
  const body =
    sseChunk({ choices: [{ delta: { reasoning_content: 'думаю...' } }] }) +
    sseChunk({ choices: [{ delta: { content: 'Ответ' } }] })
  assert.equal(extractFromSse(body), 'Ответ')
})

test('SSE: сохраняет доллар и экранированный перевод строки 1:1', () => {
  const literalN = BS + 'n' // два символа: обратный слэш и n
  const content = 'const s = ' + D + '{x}' + literalN + 'line2'
  const payload = JSON.stringify({
    tool: 'Write',
    args: { path: 'a.js', content },
  })
  const out = extractFromSse(sseChunk({ choices: [{ delta: { content: payload } }] }))
  assert.ok(out.includes(D + '{x}'), 'доллар должен сохраниться: ' + out)
  assert.ok(out.includes(literalN), 'экранированный перевод строки должен сохраниться')
})

test('JSON: достаёт content из простого ответа', () => {
  assert.equal(extractFromJson(JSON.stringify({ content: 'готово' })), 'готово')
})

test('JSON: достаёт content из message', () => {
  assert.equal(
    extractFromJson(JSON.stringify({ message: { content: 'из message' } })),
    'из message',
  )
})

test('JSON: битый JSON → пустая строка', () => {
  assert.equal(extractFromJson('{ not json'), '')
})

test('extractAnswer: SSE имеет приоритет, иначе JSON', () => {
  assert.equal(
    extractAnswer(sseChunk({ choices: [{ delta: { content: 'sse' } }] })),
    'sse',
  )
  assert.equal(extractAnswer(JSON.stringify({ content: 'json' })), 'json')
})

test('extractAnswer: сохраняет tool-call с шаблонной строкой без искажений', () => {
  const call = JSON.stringify({
    tool: 'Bash',
    args: { command: 'echo ' + D + '{HOME}' },
  })
  const out = extractAnswer(sseChunk({ choices: [{ delta: { content: call } }] }))
  assert.equal(out, call)
})
