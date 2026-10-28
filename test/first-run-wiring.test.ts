import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// The first-run wizard (N19) is a MODAL: it reads the terminal. It must run
// EXACTLY ONCE, before the browser is created (a provider it picks has to be
// the one that launches) and OUTSIDE the input loop. The broken version of
// this change put it INSIDE the main loop, where it held the first prompt:
// the terminal looked ready and every typed command hung.

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.ts'),
  'utf-8',
)

test('the wizard is invoked exactly once', () => {
  const calls = src.match(/await runFirstRunWizard\(\)/g) || []
  assert.equal(calls.length, 1, 'expected one call, got ' + calls.length)
})

test('the wizard runs BEFORE the browser is created', () => {
  const call = src.indexOf('await runFirstRunWizard()')
  const browser = src.indexOf(
    'let browser: ChatProvider = createProviderBrowser(',
  )
  assert.ok(call > 0, 'the call is missing')
  assert.ok(browser > 0, 'the browser factory is missing')
  assert.ok(call < browser, 'the wizard must run before the browser launches')
})

test('the wizard is NOT inside the main input loop', () => {
  const call = src.indexOf('await runFirstRunWizard()')
  const loop = src.indexOf('while (running) {')
  assert.ok(loop > 0, 'the input loop is missing')
  assert.ok(call < loop, 'the wizard call must precede the input loop')
})

test('a non-interactive run never opens the wizard', () => {
  // The gate lives in the pure shouldRunWizard(); index must pass the real
  // facts (config presence, TTY, the env switch and --task).
  assert.match(src, /shouldRunWizard\(\{/)
  assert.match(src, /configExists:/)
  assert.ok(src.includes('isTTY: !!(process.stdin.isTTY'), 'isTTY gate missing')
  assert.match(src, /ZAMES_NONINTERACTIVE_LOGIN === '1'/)
  assert.match(src, /oneShot: !!getArg\('--task', null\)/)
})
