import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractPathToken, extractAtFileRefs } from '../src/path-token.ts'

const SQ = String.fromCharCode(39)
const DQ = String.fromCharCode(34)

test('extractPathToken достаёт путь в кавычках из текста', () => {
  const text = SQ + '/tmp/a.png' + SQ + ' посмотри'
  const r = extractPathToken(text)
  assert.ok(r)
  assert.equal(r.path, '/tmp/a.png')
  assert.equal(r.before, '')
  assert.equal(r.after, ' посмотри')
})

test('extractPathToken достаёт путь в двойных кавычках', () => {
  const text = 'вот: ' + DQ + './img.jpg' + DQ + '?'
  const r = extractPathToken(text)
  assert.ok(r)
  assert.equal(r.path, './img.jpg')
})

test('extractPathToken достаёт голый путь среди слов', () => {
  const r = extractPathToken('смотри tmp/pic.png пожалуйста')
  assert.ok(r)
  assert.equal(r.path, 'tmp/pic.png')
})

test('extractPathToken отсекает завершающую пунктуацию', () => {
  const r = extractPathToken('файл image.png.')
  assert.ok(r)
  assert.equal(r.path, 'image.png')
})

test('extractPathToken возвращает null для текста без пути', () => {
  assert.equal(extractPathToken('просто текст без файла'), null)
  assert.equal(extractPathToken(''), null)
})

test('extractAtFileRefs достаёт несколько @-ссылок по порядку', () => {
  const refs = extractAtFileRefs('сравни @src/a.ts и @src/b.ts')
  assert.deepEqual(refs, ['src/a.ts', 'src/b.ts'])
})

test('extractAtFileRefs работает в начале строки и в скобках', () => {
  assert.deepEqual(extractAtFileRefs('@src/a.ts посмотри'), ['src/a.ts'])
  assert.deepEqual(extractAtFileRefs('файл (@src/a.ts)'), ['src/a.ts'])
})

test('extractAtFileRefs снимает завершающую пунктуацию', () => {
  assert.deepEqual(extractAtFileRefs('см. @src/a.ts, пожалуйста'), ['src/a.ts'])
})

test('extractAtFileRefs не путает @ в email/декораторе', () => {
  assert.deepEqual(extractAtFileRefs('пиши на user@host.com'), [])
  assert.deepEqual(extractAtFileRefs('@Component класс'), [])
})

test('extractAtFileRefs дедуплицирует повторы', () => {
  assert.deepEqual(extractAtFileRefs('@a.ts и снова @a.ts'), ['a.ts'])
})

test('extractAtFileRefs возвращает [] без ссылок', () => {
  assert.deepEqual(extractAtFileRefs('просто текст'), [])
  assert.deepEqual(extractAtFileRefs(''), [])
})
