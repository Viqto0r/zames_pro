import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// The turn rule between operator turns is pre-rendered ONCE and printed as a
// raw log line. It must fit the PANE (the root keeps a gutter on both sides);
// a rule as wide as the terminal wraps onto a second row and looked like a
// stray line above the message.

const src = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'src',
    'tui',
    'TuiEditor.tsx',
  ),
  'utf-8',
)

test('the turn rule is drawn to the PANE width, not the terminal width', () => {
  const at = src.indexOf('theme.turnRule(')
  assert.ok(at > 0, 'the turn rule is missing')
  const block = src.slice(at, at + 200)
  assert.match(block, /screenInnerCols\(/, 'the rule ignores the gutter')
  assert.ok(
    !/contentWidth\(\)/.test(block),
    'the rule still uses the terminal width',
  )
})
