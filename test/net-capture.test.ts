import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractFromSse,
  extractFromJson,
  extractAnswer,
  extractTokenUsage,
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
  const literalN = BS + 'n' // two characters: a backslash and n
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


test('SSE: reasoning (THINK-фрагмент) не попадает в ответ', () => {
  const body =
    sseChunk({ v: { response: { fragments: [{ id: 2, type: 'THINK', content: 'REASONING_START' }] } } }) +
    sseChunk({ p: 'response/fragments/-1/content', o: 'APPEND', v: '_SECRET_REASONING' }) +
    sseChunk({ v: '_MORE_REASONING' }) +
    sseChunk({ p: 'response/fragments', o: 'APPEND', v: [{ id: 3, type: 'RESPONSE', content: 'REAL_ANSWER' }] }) +
    sseChunk({ p: 'response/fragments/-1/content', o: 'APPEND', v: '_PART2' }) +
    sseChunk({ v: '_END' })
  const out = extractFromSse(body)
  assert.equal(out, 'REAL_ANSWER_PART2_END')
})
test('extractAnswer: сохраняет tool-call с шаблонной строкой без искажений', () => {
  const call = JSON.stringify({
    tool: 'Bash',
    args: { command: 'echo ' + D + '{HOME}' },
  })
  const out = extractAnswer(sseChunk({ choices: [{ delta: { content: call } }] }))
  assert.equal(out, call)
})

// The context counter comes in the initial fragment (v.response) and in
// BATCH updates. The LAST value must win (it is the freshest).
test('extractTokenUsage: initial v.response fragment', () => {
  const body = sseChunk({
    v: { response: { accumulated_token_usage: 35931, fragments: [] } },
  })
  assert.equal(extractTokenUsage(body), 35931)
})

test('extractTokenUsage: BATCH update overrides the initial value', () => {
  const body =
    sseChunk({ v: { response: { accumulated_token_usage: 35931 } } }) +
    sseChunk({ p: 'response/fragments/-1/content', o: 'APPEND', v: 'x' }) +
    sseChunk({
      p: 'response',
      o: 'BATCH',
      v: [{ p: 'accumulated_token_usage', v: 36380 }],
    })
  assert.equal(extractTokenUsage(body), 36380)
})

test('extractTokenUsage: no counter -> null (not 0)', () => {
  assert.equal(
    extractTokenUsage(sseChunk({ choices: [{ delta: { content: 'hi' } }] })),
    null,
  )
  assert.equal(extractTokenUsage(''), null)
  assert.equal(extractTokenUsage('not sse'), null)
})

test('extractTokenUsage: ignores non-numbers', () => {
  const body = sseChunk({ v: { response: { accumulated_token_usage: 'nope' } } })
  assert.equal(extractTokenUsage(body), null)
})
