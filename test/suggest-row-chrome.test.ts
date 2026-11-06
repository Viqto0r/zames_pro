import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestRowCount } from '../src/input/suggest.ts'
import type { SlashCommand } from '../src/input/layout.ts'

// The slash-command popup is rendered INSIDE the input Box: 4 columns of
// chrome (border + padding per side) are not available to its text, so
// InputLine must pass `pane - 4` to `suggestRowCount`. Counting at the pane
// width undercounted a row that wrapped in the box, the popup grew past the
// reserved rows and the caret/status shifted down.

const command = (description: string): SlashCommand =>
  ({ name: '/status', description }) as SlashCommand

test('a row wider than the box is counted as two rows', () => {
  // 3 + '/status'(7) + 2 + 60 = 72 columns: fits a 40-col pane, not its 36 box.
  assert.equal(suggestRowCount('/s', [command('x'.repeat(60))], 36), 2)
})

test('a row that fits the box stays one row', () => {
  assert.equal(suggestRowCount('/s', [command('xx')], 36), 1)
})

test('no match means no rows', () => {
  assert.equal(suggestRowCount('/zzz', [command('xx')], 36), 0)
})
