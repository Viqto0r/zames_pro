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
