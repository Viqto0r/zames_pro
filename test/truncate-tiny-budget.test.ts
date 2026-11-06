// The terminal UIs clip a tool ARGUMENT DETAIL to the remaining row width:
// `contentWidth() - name.length - 6` (TuiEditor.toolCall) or
// `maxW - name.length - 6` (LineEditor.toolCall). A long tool name on a narrow
// terminal makes that budget NEGATIVE (e.g. the 23-char tool name from an MCP
// server on an 80-column pane), and truncateToWidth turned the whole detail
// into a lone `…` — the operator saw no argument at all. A negative budget
// must keep at least a few characters of the path/command.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateToWidth, visLen } from '../src/input/layout.ts'

// A non-positive budget must yield NOTHING: the callers (the full-screen
// header, a pane edge) reserve an exact column count, and returning `a…`
// overflowed it by one column — the row wrapped and the layout clipped the
// input panel. The caller decides what to show when the budget is exhausted.
test('a non-positive budget yields an empty string', () => {
  assert.equal(truncateToWidth('mcp__github__create_issue', -5), '')
  assert.equal(truncateToWidth('abcdef', 0), '')
})

test('a one-column budget is the ellipsis alone', () => {
  assert.equal(truncateToWidth('mcp__github__create_issue', 1), '…')
})

test('a budget of 1 is still just the ellipsis (no room for text)', () => {
  assert.equal(truncateToWidth('abcdef', 1), '…')
})

test('a positive budget behaves as before', () => {
  assert.equal(truncateToWidth('hello world', 6), 'hello…')
  assert.equal(truncateToWidth('hello', 10), 'hello')
})
