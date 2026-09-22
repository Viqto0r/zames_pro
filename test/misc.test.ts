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
  // Разрыв на границе слова: слово целиком уходит на новую строку.
  assert.equal(r.rows[0].text, 'hello world foo')
  assert.equal(r.rows[1].text, ' bar')
  // Слово нигде не разрезано посередине.
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
  // Внутри аргументов (есть пробел) подсказки не показываем.
  e.buf = '/resume 3'
  assert.equal(e._suggestions().length, 0)

  // Tab при единственном совпадении дополняет целиком.
  e.buf = '/he'
  e._completeCommand()
  assert.equal(e.buf, '/help ')

  // Tab при нескольких — до общего префикса.
  e.buf = '/self-'
  e._completeCommand()
  assert.equal(e.buf, '/self-')
})
