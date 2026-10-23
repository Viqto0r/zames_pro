// `/diff` and `/diffstat` must BOTH swallow the shared git runner's
// "no output" sentinel. formatDiff() trims it before comparing;
// formatDiffStat() compared the raw string, so a sentinel that reached it with
// the runner's own padding printed the internal marker to the operator instead
// of `(no changes)`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDiff, formatDiffStat } from '../src/commands.ts'
import { translate } from '../src/i18n.ts'

const t = translate('en')

test('formatDiffStat treats a padded sentinel as no changes', () => {
  assert.equal(
    formatDiffStat('  (command produced no output)  ', {}, t),
    t('diff.no_changes'),
  )
  assert.equal(
    formatDiffStat('\n(command produced no output)\n', {}, t),
    t('diff.no_changes'),
  )
})

test('formatDiffStat still renders a real stat', () => {
  const real =
    ' src/a.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)'
  assert.equal(formatDiffStat(real, {}, t), real)
})
