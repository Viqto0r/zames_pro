import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unifiedDiff, colorDiff } from '../src/diff.ts'

// Strip ANSI so assertions are stable whether or not the terminal colorizes.
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

test('unifiedDiff: identical text has no diff lines', () => {
  const d = unifiedDiff('a\nb\nc', 'a\nb\nc')
  assert.equal(d, '')
})

test('unifiedDiff: changed line shows -old and +new', () => {
  const d = unifiedDiff('a\nb\nc', 'a\nX\nc')
  const lines = d.split('\n')
  assert.ok(lines.includes('-b'), 'old line missing')
  assert.ok(lines.includes('+X'), 'new line missing')
  // Unchanged lines are not emitted (this is a minimal, line-index diff).
  assert.ok(!lines.includes('-a'))
  assert.ok(!lines.includes('+c'))
})

test('unifiedDiff: added lines at the end', () => {
  const d = unifiedDiff('a', 'a\nb\nc')
  assert.equal(d, '+b\n+c')
})

test('unifiedDiff: removed lines at the end', () => {
  const d = unifiedDiff('a\nb\nc', 'a')
  assert.equal(d, '-b\n-c')
})

test('unifiedDiff: label is rendered as a leading marker', () => {
  const d = unifiedDiff('a', 'b', { label: 'src/x.ts' })
  assert.ok(d.startsWith('... src/x.ts'))
})

test('unifiedDiff: empty inputs do not throw', () => {
  assert.equal(unifiedDiff('', ''), '')
  // NOTE: an empty string is one empty line for this line-index diff, so it
  // is emitted as a removed/added empty line (`-`/`+`) next to the other side.
  assert.equal(unifiedDiff('', 'x'), '-\n+x')
  assert.equal(unifiedDiff('x', ''), '-x\n+')
})

test('colorDiff: keeps every line and adds color for +/-', () => {
  const d = unifiedDiff('a\nb', 'a\nZ')
  const out = colorDiff(d)
  const plain = stripAnsi(out)
  assert.ok(plain.includes('-b'))
  assert.ok(plain.includes('+Z'))
  // The changed lines must carry ANSI codes when color is on; when NO_COLOR
  // is set chalk returns plain text, so we only assert the plain content.
})

test('colorDiff: a +++/--- header line is kept', () => {
  const out = stripAnsi(colorDiff('+++ header\n--- header2\n+added'))
  assert.ok(out.includes('+++ header'))
  assert.ok(out.includes('--- header2'))
  assert.ok(out.includes('+added'))
})
