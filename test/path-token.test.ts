import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractPathToken } from '../src/path-token.ts'

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
