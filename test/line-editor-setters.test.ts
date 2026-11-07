import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// The editor's SETTERS and the lock/unlock pair drive the status line the
// operator watches. They are pure state transitions (the render is a no-op
// before `start()`), so they are pinned here: a stale lock hint that never
// clears, or a limit setter that accepts 0/NaN (and then renders
// `Infinity%`), is exactly the kind of silent UI bug that has no test.

function editor(): LineEditor {
  return new LineEditor()
}

test('lock sets the flag and the optional status, unlock clears the flag', () => {
  const e = editor()
  e.lock('working')
  assert.equal(e.locked, true)
  assert.ok(e.statusText.includes('working'))
  e.unlock()
  assert.equal(e.locked, false)
  // The lock hint must not linger after a fast operation.
  assert.equal(e.statusText, '')
})

test('unlock clears ANY status text (the lock hint cannot linger)', () => {
  // `unlock()` clears the status unconditionally: the spinner and the pending
  // text are re-set by the next render, while a stale lock hint would stay on
  // screen forever after a fast operation like /new.
  const e = editor()
  e.lock()
  e.setStatus('thinking...')
  e.unlock()
  assert.equal(e.statusText, '')
})

test('unlock without a previous lock still clears an idle status', () => {
  const e = editor()
  e.setStatus('idle')
  e.unlock()
  assert.equal(e.statusText, '')
})

test('setContextLimit accepts a positive finite value and ignores the rest', () => {
  const e = editor()
  e.setContextLimit(5000)
  assert.equal(e.contextLimit, 5000)
  e.setContextLimit(0)
  assert.equal(e.contextLimit, 5000)
  e.setContextLimit(-10)
  assert.equal(e.contextLimit, 5000)
  e.setContextLimit(Number.NaN)
  assert.equal(e.contextLimit, 5000)
  e.setContextLimit(Number.POSITIVE_INFINITY)
  assert.equal(e.contextLimit, 5000)
})

test('setContextStatus keeps a finite token count and drops the rest', () => {
  const e = editor()
  e.setContextStatus(1234)
  assert.equal(e.contextTokens, 1234)
  assert.ok(e.contextStatus)
  e.setContextStatus(Number.NaN)
  assert.equal(e.contextTokens, null)
  e.setContextStatus(null)
  assert.equal(e.contextStatus, null)
})

test('setPrompt replaces the prompt string', () => {
  const e = editor()
  e.setPrompt('$ ')
  assert.equal(e.promptStr, '$ ')
})

test('setStatusLine trims and stores the hook text', () => {
  const e = editor()
  e.setStatusLine('  build ok  ')
  assert.equal(e.statusLine, 'build ok')
  e.setStatusLine('')
  assert.equal(e.statusLine, '')
})

test('setProvider trims the label and an empty value hides it', () => {
  const e = editor()
  e.setProvider(' Qwen ')
  assert.equal(e.providerBadge, 'Qwen')
  e.setProvider('')
  assert.equal(e.providerBadge, '')
})

test('setCommands replaces the hint list and setLocale stores the language', () => {
  const e = editor()
  e.setCommands([{ name: '/x', description: 'd' }])
  assert.equal(e.slashCommands.length, 1)
  e.setLocale('ru')
  assert.equal(e.locale, 'ru')
})

test('clear empties the buffer, the cursor and the pasted blocks', () => {
  const e = editor()
  e.buf = 'text'
  e.cursor = 4
  e.pastes = [{ marker: '[Pasted lines#3]', text: 'a' }]
  e.clear()
  assert.equal(e.buf, '')
  assert.equal(e.cursor, 0)
  assert.deepEqual(e.pastes, [])
})

test('setTmpDir stores the attachment directory', () => {
  const e = editor()
  e.setTmpDir('/tmp/x')
  assert.equal(e._tmpDir, '/tmp/x')
})
