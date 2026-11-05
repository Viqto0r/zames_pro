// The AskUser turn must leave a trace in the LOG, not only in the transcript:
// the Ink modal is a separate app whose frame is erased on unmount, so the
// question and the operator's answer used to vanish from the terminal and the
// chat history the moment the operator pressed Enter.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAskUserLog } from '../src/run-task.ts'
import { translate } from '../src/i18n.ts'

const t = translate('en')

const NL = String.fromCharCode(10)

test('the question line carries the title, the question and the options', () => {
  const out = formatAskUserLog(
    'Which one?',
    ['first', 'second'],
    1,
    'second',
    t,
  )
  assert.ok(out.question.includes('Question from the agent'))
  assert.ok(out.question.includes('Which one?'))
  assert.ok(out.question.includes('- first'))
  assert.ok(out.question.includes('* second (recommended)'))
})

test('a multi-line question keeps every line', () => {
  const out = formatAskUserLog(
    'line one' + NL + 'line two',
    ['a', 'b'],
    null,
    'a',
    t,
  )
  assert.ok(out.question.includes('line one'))
  assert.ok(out.question.includes('line two'))
})

test('the answer line shows the chosen option', () => {
  const out = formatAskUserLog('q', ['a', 'b'], null, 'b', t)
  assert.ok(out.answer.includes('Your answer:'))
  assert.ok(out.answer.includes('b'))
})

test('a typed answer is shown verbatim', () => {
  const out = formatAskUserLog('q', ['a', 'b'], null, 'my own words', t)
  assert.ok(out.answer.includes('my own words'))
})

test('a dismissed question says so instead of staying blank', () => {
  for (const v of [null, '']) {
    const out = formatAskUserLog('q', ['a', 'b'], null, v, t)
    assert.ok(out.answer.includes('no answer'))
  }
})

test('the text is localized', () => {
  const ru = translate('ru')
  const out = formatAskUserLog('q', ['a', 'b'], null, null, ru)
  assert.ok(out.question.includes('Вопрос от агента'))
  assert.ok(out.answer.includes('Ваш ответ'))
})
