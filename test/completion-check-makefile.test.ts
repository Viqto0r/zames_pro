import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isRunnablePath,
  needsCompletionNudge,
  type RunStep,
} from '../src/completion-check.ts'

// The completion guard exists for one live failure: a model wrote an
// INCOMPLETE artifact and declared the task done without ever running it.
// `isRunnablePath` decides whether an edited file is such an artifact, and it
// only looked at a file EXTENSION. Two very common artifacts have none:
// a `Makefile`/`Dockerfile` and a plain executable script (`deploy`, `run`),
// so writing one and answering DONE without a single Bash call was never
// nudged — exactly the case the guard was written for.

const edit = (path?: string): RunStep => ({
  tool: 'Write',
  mutating: true,
  path,
})

test('a Makefile and a Dockerfile are runnable artifacts', () => {
  assert.equal(isRunnablePath('Makefile'), true)
  assert.equal(isRunnablePath('src/Dockerfile'), true)
  assert.equal(isRunnablePath('deploy/Containerfile'), true)
  assert.equal(needsCompletionNudge([edit('Makefile')]), true)
})

test('the guard names them, so the model is asked to run them', () => {
  assert.equal(isRunnablePath('build.ninja'), true)
  assert.equal(isRunnablePath('CMakeLists.txt'), false)
})
