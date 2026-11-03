import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isFinishedWithAnswer,
  isFinishedAwaitingAnswer,
  isFinishedWithoutAnswer,
  extractAnswer,
} from '../src/net-capture.ts'

// The "⏳ DeepSeek оборвал ответ и кнопки Continue нет" loop, reproduced from
// the OPERATOR's own net-log.
//
// DeepSeek opens a turn with a SNAPSHOT fragment whose content is only `\n\n`
// (the answer itself arrives in the following bare `data: {"v":"..."}`
// chunks). The snapshot alone is a HEAD of a still-streaming answer, so no
// detector may treat it as a complete one.
function finishedBody(snapshot: string, appended: string[] = []): string {
  const NL = String.fromCharCode(10)
  const lines = [
    'data: ' +
      JSON.stringify({
        v: {
          response: {
            status: 'WIP',
            fragments: [{ id: 2, type: 'RESPONSE', content: snapshot }],
          },
        },
      }),
  ]
  for (const piece of appended) {
    lines.push(
      'data: ' +
        JSON.stringify({
          p: 'response/fragments/-1/content',
          o: 'APPEND',
          v: piece,
        }),
    )
  }
  lines.push(
    'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"FINISHED"}]}',
  )
  lines.push('data: {"p":"response/status","o":"SET","v":"FINISHED"}')
  return lines.join(NL)
}

const NL = String.fromCharCode(10)

test('a bare-newline snapshot is a head, not an answer', () => {
  const b = finishedBody(NL + NL)
  assert.equal(extractAnswer(b).trim(), '')
  assert.equal(isFinishedWithAnswer(b), false)
  assert.equal(isFinishedAwaitingAnswer(b), true)
  assert.equal(isFinishedWithoutAnswer(b), true)
})

test('the answer arrives in the appended chunks', () => {
  const b = finishedBody(NL + NL, [
    '{"tool": "Bash", "args": {"command": "cd /workspaces/zames/zames_pro"}}',
  ])
  assert.match(extractAnswer(b), /"tool"/)
  assert.equal(isFinishedWithAnswer(b), true)
  assert.equal(isFinishedAwaitingAnswer(b), false)
})

test('a lone `{` head is a snapshot too', () => {
  const b = finishedBody('{')
  assert.equal(isFinishedWithAnswer(b), false)
  assert.equal(isFinishedAwaitingAnswer(b), true)
})

test('a real answer that starts with text is accepted at once', () => {
  const b = finishedBody('Готово: обновил файл')
  assert.equal(isFinishedWithAnswer(b), true)
  assert.equal(isFinishedAwaitingAnswer(b), false)
})
