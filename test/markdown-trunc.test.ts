import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/markdown.ts'

test('renderMarkdown ne obrezaet dlinnyy tekst', () => {
 const t = 'start ' + 'x'.repeat(2000) + ' tail-MARKER-END'
 const out = renderMarkdown(t)
 assert.ok(out.includes('tail-MARKER-END'), 'tail must survive')
 assert.ok(out.includes('start'), 'head must survive')
})

test('renderMarkdown sohranyaet hvost posle figurnyh skobok', () => {
 const Q = String.fromCharCode(34)
 const obj = '{' + Q + 'tool' + Q + ': ' + Q + 'Read' + Q + '}'
 const t = 'example: ' + obj + ' hvost-TAIL'
 const out = renderMarkdown(t)
 assert.ok(out.includes('hvost-TAIL'), 'tail after braces must survive')
})
