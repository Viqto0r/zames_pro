import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unifiedDiff } from '../src/diff.ts'
import { layoutInput, visLen } from '../src/input.ts'
import { buildSystemPrompt } from '../src/system-prompt.ts'
import type { ToolDef } from '../src/types.ts'

const NL = String.fromCharCode(10)

test('unifiedDiff показывает добавленные и удалённые строки', () => {
  const a = ['x', 'y', 'z'].join(NL)
  const b = ['x', 'Y', 'z'].join(NL)
  const d = unifiedDiff(a, b)
  assert.ok(d.includes('-y'), d)
  assert.ok(d.includes('+Y'), d)
})

test('unifiedDiff на одинаковых строках пуст', () => {
  const a = 'same'
  assert.equal(unifiedDiff(a, a), '')
})

test('visLen игнорирует ANSI-последовательности', () => {
  const red = String.fromCharCode(27) + '[31m' + 'abc' + String.fromCharCode(27) + '[0m'
  assert.equal(visLen(red), 3)
  assert.equal(visLen('abc'), 3)
})

test('layoutInput возвращает одну строку для короткого ввода', () => {
  const r = layoutInput('> ', 'hello', 5, 80)
  assert.equal(r.rows.length, 1)
  assert.equal(r.cursorRow, 0)
})

test('layoutInput переносит длинный ввод на несколько строк', () => {
  const r = layoutInput('> ', 'x'.repeat(200), 200, 40)
  assert.ok(r.rows.length > 1, 'должно быть больше одной строки')
})

test('layoutInput учитывает переводы строк во вводе', () => {
  const r = layoutInput('> ', 'a' + NL + 'b', 3, 80)
  assert.equal(r.rows.length, 2)
})

test('buildSystemPrompt включает описания инструментов и рабочую директорию', () => {
  const tools: ToolDef[] = [
    { name: 'Read', description: 'прочитать', parameters: { path: 'string' }, fn: async () => '' },
  ]
  const sp = buildSystemPrompt({ workdir: '/work/dir', tools, gitContext: 'ctx' })
  assert.ok(sp.includes('/work/dir'), 'workdir должен быть в промпте')
  assert.ok(sp.includes('### Read'), 'описание инструмента должно быть в промпте')
  assert.ok(sp.includes('SILENT OPERATION'), 'правила должны быть в промпте')
})

test('buildSystemPrompt добавляет git-контекст, если он есть', () => {
  const sp = buildSystemPrompt({ workdir: '/w', tools: [], gitContext: 'BRANCH-INFO' })
  assert.ok(sp.includes('BRANCH-INFO'), sp)
})


import { isRateLimitText, RateLimitError } from '../src/browser.ts'

test('isRateLimitText: ловит сообщение лимита частоты', () => {
  assert.ok(isRateLimitText('Messages too frequent. Try again later.'))
  assert.ok(isRateLimitText('Too many requests'))
  assert.ok(isRateLimitText('Слишком часто запросы'))
  assert.ok(!isRateLimitText('обычный ответ модели'))
})

test('RateLimitError: имя и сообщение', () => {
  const e = new RateLimitError('detail')
  assert.ok(e instanceof Error)
  assert.equal(e.name, 'RateLimitError')
  assert.ok(e.message.includes('detail'))
})

test('layoutInput переносит по словам, не разрывая слово', () => {
  const r = layoutInput('> ', 'hello world foo bar', 21, 20)
  assert.equal(r.rows.length, 2)
  // Break at a word boundary: the whole word moves to the new line.
  assert.equal(r.rows[0].text, 'hello world foo')
  assert.equal(r.rows[1].text, ' bar')
  // The word is not split anywhere in the middle.
  const joined = r.rows.map((x) => x.text).join('')
  assert.equal(joined, 'hello world foo bar')
})

import { LineEditor } from '../src/input.ts'

test('slash-подсказки: фильтрация и Tab-дополнение', () => {
  const cmds = [
    { name: '/help', description: 'h' },
    { name: '/self-review', description: 'r' },
    { name: '/self-fix', description: 'f' },
    { name: '/new', description: 'n' },
  ]
  const e = new LineEditor({ commands: cmds })

  e.buf = '/'
  assert.equal(e._suggestions().length, 4)
  e.buf = '/s'
  assert.deepEqual(
    e._suggestions().map((c) => c.name),
    ['/self-review', '/self-fix'],
  )
  e.buf = '/x'
  assert.equal(e._suggestions().length, 0)
  // Inside arguments (there is a space) we don't show hints.
  e.buf = '/resume 3'
  assert.equal(e._suggestions().length, 0)

  // Tab with a single match completes it whole.
  e.buf = '/he'
  e._completeCommand()
  assert.equal(e.buf, '/help ')

  // Tab with several matches — up to the common prefix.
  e.buf = '/self-'
  e._completeCommand()
  assert.equal(e.buf, '/self-')
})

test('lock блокирует ввод и submit, Ctrl+C проходит', () => {
  const e = new LineEditor()
  e._render = () => {}
  e.printAbove = () => {}
  // setStatus is kept real (not stubbed): unlock() must clear the status
  // hint, otherwise "operation in progress" stays on screen forever.
  let submitted = ''
  let aborted = 0
  e.onSubmit = (t) => { submitted = t }
  e.onCtrlC = () => { aborted++ }
  const CRc = String.fromCharCode(13)
  const CTRL_C = String.fromCharCode(3)

  e.lock('wait')
  assert.equal(e.locked, true)
  assert.ok(e.statusText.includes('wait'))

  // Text input is swallowed: the buffer stays empty.
  e._handle(Buffer.from('hello'))
  assert.equal(e.buf, '')

  // Enter does not submit anything (nothing is queued).
  e._handle(Buffer.from(CRc))
  assert.equal(submitted, '')

  // Ctrl+C still reaches the handler so the user can abort.
  e._handle(Buffer.from(CTRL_C))
  assert.equal(aborted, 1)

  // After unlock, input works again — and the lock status hint is gone.
  e.unlock()
  assert.equal(e.locked, false)
  assert.equal(e.statusText, '')
  e.buf = 'hi'
  e.cursor = 2
  e._handle(Buffer.from(CRc))
  assert.equal(submitted, 'hi')
})

test('Enter после «\\» удаляет «\\» и переносит строку', () => {
  const e = new LineEditor()
  e._render = () => {}
  e.printAbove = () => {}
  let submitted = ''
  e.onSubmit = (t) => { submitted = t }
  const CRc = String.fromCharCode(13)

  // A plain Enter — submit.
  e.buf = 'hello'
  e.cursor = 5
  e._handle(Buffer.from(CRc))
  assert.equal(submitted, 'hello')

  // «\» + Enter — a line break, no submit, the «\» disappears.
  submitted = ''
  e.buf = 'line1\\'
  e.cursor = 6
  e._handle(Buffer.from(CRc))
  assert.equal(submitted, '')
  assert.equal(e.buf, 'line1' + String.fromCharCode(10))
  assert.equal(e.cursor, 6)

  // Ctrl+J always breaks the line, even without «\».
  e.buf = 'a'
  e.cursor = 1
  e._handle(Buffer.from(String.fromCharCode(10)))
  assert.equal(e.buf, 'a' + String.fromCharCode(10))
})

import { visRows } from '../src/input.ts'

test('visRows считает перенос статуса по ширине', () => {
  assert.equal(visRows('short', 80), 1)
  assert.equal(visRows('x'.repeat(120), 80), 2)
  assert.equal(visRows('x'.repeat(200), 80), 3)
  // ANSI sequences don't affect the visible length.
  assert.equal(visRows('\u001b[31m' + 'x'.repeat(80), 80), 1)
})

test('buildSystemPrompt содержит требования к формату tool-call', () => {
  const sp = buildSystemPrompt({ workdir: '/w', tools: [] })
  assert.ok(sp.includes('TOOL CALL FORMAT'))
  // There must be explicit prohibitions against real format mistakes.
  assert.ok(/DOUBLE quotes/.test(sp))
  assert.ok(/single quotes/.test(sp))
  assert.ok(/XML\/DSML/.test(sp))
  assert.ok(/truncate/i.test(sp))
})

test('buildSystemPrompt локализует инструкцию о языке ответа', () => {
  const ru = buildSystemPrompt({ workdir: '/w', tools: [], locale: 'ru' })
  const en = buildSystemPrompt({ workdir: '/w', tools: [], locale: 'en' })
  assert.ok(/русск/i.test(ru))
  assert.ok(/English/i.test(en))
})

test('buildSystemPrompt содержит жёсткий блок ONLY TOOL CALLS', () => {
  const sp = buildSystemPrompt({ workdir: '/w', tools: [] })
  // Default locale is ru; the English heading appears with locale: 'en'.
  assert.ok(sp.includes('ТОЛЬКО ВЫЗОВЫ ИНСТРУМЕНТОВ'), 'блок должен присутствовать')
  // The block must explicitly forbid plain prose between calls.
  assert.ok(/ТОЛЬКО через вызовы инструментов/.test(sp))
  assert.ok(/respond/.test(sp))
  // The SILENT OPERATION / NO PROSE sections must remain.
  assert.ok(sp.includes('NO PROSE AROUND TOOL CALLS'))
})

test('блок ONLY TOOL CALLS локализован (ru/en)', () => {
  const ru = buildSystemPrompt({ workdir: '/w', tools: [], locale: 'ru' })
  const en = buildSystemPrompt({ workdir: '/w', tools: [], locale: 'en' })
  assert.ok(ru.includes('ТОЛЬКО ВЫЗОВЫ ИНСТРУМЕНТОВ'))
  assert.ok(en.includes('ONLY TOOL CALLS'))
  // And each locale gets its own text, not the other's.
  assert.ok(!en.includes('ТОЛЬКО ВЫЗОВЫ ИНСТРУМЕНТОВ'))
})
