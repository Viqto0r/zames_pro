// `/diff` renders `git diff` output through formatDiff(). An EMPTY diff is
// reported by the shared git runner as the sentinel `(command produced no
// output)` — the exact string formatDiffStat() already treats as "no
// changes". formatDiff() did not, so a clean tree printed that internal
// sentinel to the operator instead of `(no changes)`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDiff, formatDiffStat } from '../src/commands.ts'
import { translate } from '../src/i18n.ts'

const t = translate('en')

test('formatDiff treats the git runner sentinel as no changes', () => {
  assert.equal(
    formatDiff('(command produced no output)', {}, t),
    t('diff.no_changes'),
  )
  assert.equal(
    formatDiff('  (command produced no output)  ', {}, t),
    t('diff.no_changes'),
  )
})

test('formatDiff and formatDiffStat agree on an empty result', () => {
  const sentinel = '(command produced no output)'
  assert.equal(formatDiff(sentinel, {}, t), formatDiffStat(sentinel, {}, t))
})

test('formatDiff still renders a real diff', () => {
  const real = 'diff --git a/x b/x\n+added line'
  assert.equal(formatDiff(real, {}, t), real)
})
