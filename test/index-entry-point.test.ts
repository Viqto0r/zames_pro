import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// src/index.ts is the ENTRY POINT: importing it runs `main()`, so it cannot be
// unit-tested directly (the existing first-run/live-tasks files read its source
// for the same reason). These checks pin the invariants that a refactor of the
// entry point can silently break, and that no other module can enforce.

const src = fs.readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'src',
    'index.ts',
  ),
  'utf-8',
)

function count(re: RegExp): number {
  return (src.match(re) || []).length
}

test('the goal is stored per PROJECT, not in the session JSON', () => {
  // A session == one chat; the goal must survive /new and /compact.
  assert.match(src, /\.zames-goal/, 'the goal file name changed')
  assert.equal(count(/let sessionGoal/g), 1, 'one goal holder')
})

test('the theme and the answer width are applied BEFORE the input loop', () => {
  const themeAt = src.indexOf('applyTheme(config.ui?.theme)')
  const widthAt = src.indexOf('setAnswerWidth(')
  assert.ok(themeAt > 0, 'the theme apply is missing')
  assert.ok(widthAt > 0, 'the answer-width apply is missing')
  // The banner and the first prompt read the LIVE theme object, so a late
  // apply would paint the first screen with the default palette.
  assert.ok(
    themeAt < src.indexOf('async function main()'),
    'theme applied late',
  )
})

test('/provider builds the browser through the ONE factory', () => {
  // A second construction site would drift (a provider switch could miss a
  // capability the startup path sets).
  assert.ok(
    count(/function createProviderBrowser\(/) === 1,
    'more than one browser factory',
  )
})

test('a model pick re-derives the context limit for the ACTIVE provider', () => {
  const calls = count(/applyModelContextLimit\(/g)
  // One definition + the two pick sites (/model and a model intent).
  assert.ok(calls >= 3, 'expected the definition and both pick sites')
})

test('the goal is cleared through the SAME setter the restore uses', () => {
  // Two writers would let `/goal off` leave the file behind.
  assert.ok(count(/saveGoal\(/g) >= 2, 'saveGoal is not used by /goal')
  assert.ok(count(/loadGoal\(/g) >= 2, 'loadGoal is not used by the restore')
})

test('the entry point does not import a test-only helper', () => {
  assert.equal(src.includes("from './test"), false)
})
