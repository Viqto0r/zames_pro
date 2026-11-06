import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomThinkingPhrase, stripEllipsis } from '../src/spinner.ts'

// `stripEllipsis` strips EVERY trailing dot, so a phrase that ends with an
// ABBREVIATION or a version number loses real text: 'Загрузка v1.' becomes
// 'Загрузка v1', 'Анализ...' → 'Анализ' (correct), but 'Думаю 5.' → 'Думаю 5'.
// The real defect is the EMPTY result: a phrase that is ONLY dots becomes '',
// and the spinner then animates bare dots with no label at all.

test('a dots-only phrase does not become empty', () => {
  assert.notEqual(stripEllipsis('...'), '')
  assert.notEqual(stripEllipsis('…'), '')
})

test('a normal phrase keeps its text', () => {
  assert.equal(stripEllipsis('Думаю...'), 'Думаю')
  assert.equal(stripEllipsis('thinking...'), 'thinking')
})

test('the built-in phrases are never dots-only', () => {
  for (const loc of ['ru', 'en'] as const) {
    for (let i = 0; i < 20; i++) {
      assert.notEqual(stripEllipsis(randomThinkingPhrase(loc)), '')
    }
  }
})
