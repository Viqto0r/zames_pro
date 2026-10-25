// Unit tests for the fenced-code-block extractor (src/code-blocks.ts).
// The RAW fence text must be recovered from the Markdown answer, not the
// ANSI-highlighted render. Nothing in src/ calls the extractor today (the
// Ctrl+Y / /copy-code feature was removed); it is kept as a pure helper, so
// these tests are its only consumer.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractCodeBlocks } from '../src/code-blocks.ts'

const NL = String.fromCharCode(10)
const F = '```'

test('extractCodeBlocks: a single fenced block with a language', () => {
  const md =
    'text' +
    NL +
    F +
    'ts' +
    NL +
    'const a = 1' +
    NL +
    'const b = 2' +
    NL +
    F +
    NL +
    'after'
  const b = extractCodeBlocks(md)
  assert.equal(b.length, 1)
  assert.equal(b[0].lang, 'ts')
  assert.equal(b[0].text, 'const a = 1' + NL + 'const b = 2')
  assert.equal(b[0].index, 1)
})

test('extractCodeBlocks: no language', () => {
  const md = F + NL + 'plain' + NL + F
  const b = extractCodeBlocks(md)
  assert.equal(b.length, 1)
  assert.equal(b[0].lang, '')
  assert.equal(b[0].text, 'plain')
})

test('extractCodeBlocks: several blocks keep order and index', () => {
  const md = [F + 'js', 'a', F, 'mid', F + 'py', 'b', F].join(NL)
  const b = extractCodeBlocks(md)
  assert.equal(b.length, 2)
  assert.equal(b[0].lang, 'js')
  assert.equal(b[0].text, 'a')
  assert.equal(b[1].lang, 'py')
  assert.equal(b[1].text, 'b')
  assert.equal(b[1].index, 2)
})

test('extractCodeBlocks: a longer closing fence still closes', () => {
  const md = F + 'ts' + NL + 'x' + NL + '`````' + NL + 'tail'
  const b = extractCodeBlocks(md)
  assert.equal(b.length, 1)
  assert.equal(b[0].text, 'x')
})

test('extractCodeBlocks: an UNTERMINATED block is still returned', () => {
  const md = 'p' + NL + F + 'ts' + NL + 'line1' + NL + 'line2'
  const b = extractCodeBlocks(md)
  assert.equal(b.length, 1)
  assert.equal(b[0].text, 'line1' + NL + 'line2')
})

test('extractCodeBlocks: tilde fences work and do not close on backticks', () => {
  const md = '~~~' + NL + 'a' + NL + F + NL + 'b' + NL + '~~~'
  const b = extractCodeBlocks(md)
  assert.equal(b.length, 1)
  assert.equal(b[0].text, 'a' + NL + F + NL + 'b')
})

test('extractCodeBlocks: an empty answer yields nothing', () => {
  assert.deepEqual(extractCodeBlocks(''), [])
  assert.deepEqual(extractCodeBlocks('just prose'), [])
})
