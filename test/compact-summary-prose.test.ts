import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isUsableCompactSummary } from '../src/commands.ts'

// `/compact` (and the auto-compact seam) validates the OLD chat's summary
// before posting it into the NEW chat. The validator rejects protocol noise,
// but it matched the bare word `DSML` (case-insensitive) ANYWHERE in the text:
// a perfectly good summary that merely MENTIONS the feature — "We added a DSML
// parser and verified it" — was rejected as unusable. Every retry then failed
// the same way and the compaction fell back to a local history dump (worse
// summary, and the retries burned the rate-limit budget for nothing).

test('a summary that mentions DSML as prose is usable', () => {
  const summary =
    'We added a DSML parser to the tool-call handling and verified it with the full test suite; all green.'
  assert.equal(isUsableCompactSummary(summary), true, summary)
})

test('a real DSML tool-call block is still rejected', () => {
  const noise =
    '<｜DSML｜invoke name="Read"><｜DSML｜parameter name="path">a.ts</｜DSML｜parameter></｜DSML｜invoke>'
  assert.equal(isUsableCompactSummary(noise), false, noise)
})

test('a summary that mentions the safety marker as prose is usable', () => {
  const summary =
    'No <ds_safety> marker appeared in the answer; the work is complete and the tests pass.'
  assert.equal(isUsableCompactSummary(summary), true, summary)
})
