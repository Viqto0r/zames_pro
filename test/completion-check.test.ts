import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isRunnablePath,
  needsCompletionNudge,
  COMPLETION_NUDGE,
  type RunStep,
} from '../src/completion-check.ts'

// A model can write an INCOMPLETE page (a live case: snake.html with no game
// loop) and declare the task done. The loop nudges ONCE when a runnable file
// was written/edited and NOTHING was run since — see src/completion-check.ts.

const edit = (path?: string): RunStep => ({
  tool: 'Write',
  mutating: true,
  path,
})
const bash: RunStep = { tool: 'Bash', mutating: false }
const read: RunStep = { tool: 'Read', mutating: false }

test('runnable extensions are recognised, docs are not', () => {
  assert.equal(isRunnablePath('snake.html'), true)
  assert.equal(isRunnablePath('src/App.tsx'), true)
  assert.equal(isRunnablePath('script.PY'), true)
  assert.equal(isRunnablePath('README.md'), false)
  assert.equal(isRunnablePath('package.json'), false)
  assert.equal(isRunnablePath('Makefile'), false)
  assert.equal(isRunnablePath(undefined), false)
})

test('a code edit without any Bash after it needs a nudge', () => {
  assert.equal(needsCompletionNudge([edit('game.js')]), true)
  assert.equal(needsCompletionNudge([edit('game.js'), read]), true)
})

test('Bash BEFORE the last edit does not count as verification', () => {
  assert.equal(needsCompletionNudge([bash, edit('game.js')]), true)
})

test('Bash AFTER the last edit counts as a check', () => {
  assert.equal(needsCompletionNudge([edit('game.js'), bash]), false)
  assert.equal(needsCompletionNudge([edit('a.py'), edit('b.py'), bash]), false)
  // Only the LAST edit matters: a check in between is not enough.
  assert.equal(needsCompletionNudge([edit('a.py'), bash, edit('b.py')]), true)
})

test('a non-runnable edit never triggers the nudge', () => {
  assert.equal(needsCompletionNudge([edit('README.md')]), false)
  assert.equal(
    needsCompletionNudge([edit('package.json'), edit('AGENTS.md')]),
    false,
  )
})

test('a mutating call without a path does not trigger it', () => {
  assert.equal(needsCompletionNudge([edit(undefined)]), false)
})

test('no steps at all is not a nudge', () => {
  assert.equal(needsCompletionNudge([]), false)
})

test('the nudge text asks for a real check and stays agent-facing English', () => {
  assert.match(COMPLETION_NUDGE, /COMPLETE and actually runs/)
  assert.doesNotMatch(COMPLETION_NUDGE, /[\u0400-\u04FF]/)
})
