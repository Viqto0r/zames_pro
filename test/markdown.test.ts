import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown, setAnswerWidth } from '../src/markdown.ts'

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

test('renderMarkdown: empty string returns empty string', () => {
  assert.equal(renderMarkdown(''), '')
})

test('renderMarkdown: plain text survives', () => {
  const out = stripAnsi(renderMarkdown('hello world'))
  assert.ok(out.includes('hello world'))
})

test('renderMarkdown: a heading is rendered (text is kept)', () => {
  const out = stripAnsi(renderMarkdown('# Title'))
  assert.ok(out.includes('Title'))
})

test('renderMarkdown: a list keeps its items', () => {
  const out = stripAnsi(renderMarkdown('- one\n- two'))
  assert.ok(out.includes('one'))
  assert.ok(out.includes('two'))
})

test('renderMarkdown: a fenced code block keeps the code', () => {
  const out = stripAnsi(renderMarkdown('```js\nconst x = 1\n```'))
  assert.ok(out.includes('const x = 1'))
})

test('renderMarkdown: inline code is not dropped', () => {
  const out = stripAnsi(renderMarkdown('use `npm ci`'))
  assert.ok(out.includes('npm ci'))
})

test('renderMarkdown: a table is rendered without throwing', () => {
  const md = '| a | b |\n| - | - |\n| 1 | 2 |'
  const out = stripAnsi(renderMarkdown(md))
  assert.ok(out.includes('a'))
  assert.ok(out.includes('1'))
})

test('renderMarkdown: keeps ANSI styling (headings/bold) when NO_COLOR is unset', () => {
  // markdansi used to infer color support from `process.stdout.isTTY`, so a
  // piped answer lost the whole theme. The renderer must always emit SGR now;
  // NO_COLOR is the only opt-out.
  const saved = process.env.NO_COLOR
  delete process.env.NO_COLOR
  try {
    const out = renderMarkdown('# Title\n\n**bold**')
    assert.ok(/\x1b\[/.test(out), 'SGR styling must be present')
    assert.ok(stripAnsi(out).includes('Title'))
  } finally {
    if (saved === undefined) delete process.env.NO_COLOR
    else process.env.NO_COLOR = saved
  }
})

test('renderMarkdown: NO_COLOR disables ANSI entirely', () => {
  const saved = process.env.NO_COLOR
  process.env.NO_COLOR = '1'
  try {
    const out = renderMarkdown('# Title\n\n**bold**')
    assert.ok(!/\x1b\[/.test(out), 'no SGR codes when NO_COLOR is set')
    assert.ok(out.includes('Title'))
  } finally {
    if (saved === undefined) delete process.env.NO_COLOR
    else process.env.NO_COLOR = saved
  }
})

test('setAnswerWidth: does not break rendering', () => {
  setAnswerWidth(40)
  const out = stripAnsi(renderMarkdown('hello width'))
  assert.ok(out.includes('hello width'))
  setAnswerWidth(0)
})

test('renderMarkdown: malformed markdown does not throw', () => {
  assert.doesNotThrow(() => renderMarkdown('# unclosed *bold _x'))
  assert.doesNotThrow(() => renderMarkdown('```\nunterminated'))
})
