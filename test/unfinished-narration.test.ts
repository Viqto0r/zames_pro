import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeUnfinishedWork } from '../src/answer-parse.ts'

// A final REPORT often recounts the steps that were just completed using the
// same future-tense forms the heuristic looks for:
//
//   "Tests pass. Now I will run the build."
//   "I have updated the README. Now let me commit."
//
// The heuristic fired on those, the loop re-asked the model ("it looks like
// you meant to call a tool but did not") up to 3 times, and after the budget it
// ended with a "the model stopped calling tools" warning — on a complete
// answer. The words that make a sentence a NARRATION of done work are the
// perfect/present forms (`have updated`, `tests pass`, `fixed`, `done`), not a
// bare "Now" in the middle of a report.

test('a report that narrates completed steps is not unfinished work', () => {
  const cases = [
    'Tests pass. Now I will run the build.',
    'I have updated the README. Now let me commit.',
    'Все тесты проходят, now let me run lint.',
    'The build succeeded. Now I will run the tests.',
    'I fixed the bug. Let me verify.',
  ]
  for (const c of cases) {
    assert.equal(looksLikeUnfinishedWork(c), false, c)
  }
})

test('a bare promise to act is still unfinished work', () => {
  const cases = [
    'Now write the file',
    'Let me run the tests',
    'I will check now',
    'Проверю тесты',
  ]
  for (const c of cases) {
    assert.equal(looksLikeUnfinishedWork(c), true, c)
  }
})
