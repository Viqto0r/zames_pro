import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { STOP_NAME_RE } from '../src/browser.ts'

// B3: the finish loop must NOT return a "stable" answer while the Stop button
// is still visible. A long answer looks stable between two ticks (the text has
// not changed yet) but the generation is still running; returning there cut the
// answer short. The rule the loop implements:
//   paused (Continue visible)          -> click + keep waiting, never return
//   generating (Stop visible)          -> keep waiting, never return
//   not generating + not paused        -> return the stable answer
function decide(
  continueVisible: boolean,
  generating: boolean,
  stable: boolean,
): string {
  if (continueVisible) return 'click'
  if (stable && !generating) return 'return'
  return 'wait'
}

test('a visible Stop button blocks the stability early-return', () => {
  assert.equal(decide(false, true, true), 'wait')
})

test('a visible Continue button blocks the stability early-return', () => {
  assert.equal(decide(true, false, true), 'click')
})

test('a settled answer with no Stop/Continue is returned', () => {
  assert.equal(decide(false, false, true), 'return')
})

test('STOP_NAME_RE matches stop labels and rejects prose', () => {
  assert.equal(STOP_NAME_RE.test('Stop'), true)
  assert.equal(STOP_NAME_RE.test('Остановить'), true)
  assert.equal(STOP_NAME_RE.test('Stop generating'), true)
  assert.equal(STOP_NAME_RE.test('Остановить генерацию'), true)
  assert.equal(STOP_NAME_RE.test('Stop the world and let me off'), false)
  assert.equal(STOP_NAME_RE.test('Отмена'), false)
})

test('the finish loop no longer returns on isNew while still generating', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', 'src', 'browser.ts'), 'utf-8')
  // The old buggy condition returned when `isNew || !_isGenerating()`.
  assert.ok(
    !/else if \(isNew \|\| !\(await this\._isGenerating\(\)\)\)/.test(src),
    'the isNew short-circuit must be gone',
  )
  assert.ok(
    /else if \(!\(await this\._isGenerating\(\)\)\)/.test(src),
    'the return must require the generation to have ended',
  )
})
