import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TuiEditor } from '../src/tui/TuiEditor.tsx'

// test/tui-submit-scroll.test.ts drives ONE path (submit resets the scroll).
// The rest of the `UiEditor` surface that index.ts / run-task.ts call
// imperatively was untested: a setter that stores the wrong key, forgets to
// TRIM, or drops an unknown value into the store shows up only as a wrong
// status line. Everything here works without a terminal (no TTY -> no mount).

const snap = (e: TuiEditor) => e.store.getSnapshot()

test('setStatus / setProvider / setStatusLine normalize their input', () => {
  const e = new TuiEditor()
  e.setStatus('busy')
  assert.equal(snap(e).statusText, 'busy')
  e.setStatus('')
  assert.equal(snap(e).statusText, '')
  e.setProvider('  Qwen  ')
  assert.equal(snap(e).provider, 'Qwen')
  e.setStatusLine('  ci ✓  ')
  assert.equal(snap(e).statusLine, 'ci ✓')
})

test('setSendState accepts only the known lifecycle values', () => {
  const e = new TuiEditor()
  for (const v of ['generating', 'paused', 'settled'] as const) {
    e.setSendState(v)
    assert.equal(snap(e).sendState, v)
  }
  e.setSendState('nonsense')
  assert.equal(snap(e).sendState, '')
})

test('setPrompt keeps the raw prompt (spacing is meaningful)', () => {
  const e = new TuiEditor()
  e.setPrompt('repo › ')
  assert.equal(snap(e).prompt, 'repo › ')
})

test('setHeader writes only the fields that were PASSED', () => {
  const e = new TuiEditor()
  e.setHeader({ title: 'zames', version: '1.0.0', workdir: '/p' })
  assert.equal(snap(e).title, 'zames')
  assert.equal(snap(e).version, '1.0.0')
  assert.equal(snap(e).workdir, '/p')
  // An update that carries ONLY the mouse flag must not wipe the header.
  e.setHeader({ mouseScroll: true })
  assert.equal(snap(e).title, 'zames')
  assert.equal(snap(e).workdir, '/p')
  assert.equal(snap(e).mouseScroll, true)
})

test('setContextStatus formats the counter and DROPS an unusable value', () => {
  const e = new TuiEditor()
  e.setContextStatus(120_000)
  assert.match(String(snap(e).contextText), /^ctx: 120k · 12%$/)
  assert.equal(snap(e).contextLevel, 'ok')
  e.setContextStatus(null)
  assert.equal(snap(e).contextText, null)
  assert.equal(snap(e).contextLevel, null)
  e.setContextStatus(Number.NaN)
  assert.equal(snap(e).contextText, null)
  // A NEGATIVE count is nonsense: no badge at all.
  e.setContextStatus(-1)
  assert.equal(snap(e).contextText, null)
})

test('setContextLimit ignores an unusable limit and keeps the default', () => {
  const e = new TuiEditor()
  e.setContextStatus(500_000)
  // 500k of the default 1M window is 50% -> the warn level.
  assert.equal(snap(e).contextLevel, 'warn')
  for (const bad of [0, -5, Number.NaN, Infinity]) {
    e.setContextLimit(bad)
    assert.equal(snap(e).contextLevel, 'warn', String(bad))
  }
  e.setContextLimit(500_000)
  assert.equal(snap(e).contextLevel, 'high')
})

test('setLocale / setTheme / setCommands reach the store', () => {
  const e = new TuiEditor()
  e.setLocale('ru')
  assert.equal(snap(e).locale, 'ru')
  const before = snap(e).themeNonce
  e.setTheme({})
  assert.notEqual(snap(e).themeNonce, before)
  const cmds = [{ name: 'status', handler: () => {} }]
  e.setCommands(cmds as never)
  assert.equal(snap(e).commands.length, 1)
})

test('lock/unlock toggle the flag and clear the lock text on unlock', () => {
  const e = new TuiEditor()
  e.lock('resuming…')
  assert.equal(snap(e).locked, true)
  assert.match(String(snap(e).statusText), /resuming…/)
  e.unlock()
  assert.equal(snap(e).locked, false)
  assert.equal(snap(e).statusText, '')
  // unlock() clears whatever status text is there (the editor's own field and
  // the store), so a lock hint never lingers after the unlock.
  e.setStatus('kept')
  e.lock()
  e.unlock()
  assert.equal(snap(e).statusText, '')
})

test('thinking shows the pending text when one is set, else animates', () => {
  const e = new TuiEditor()
  e.setPending('half typed')
  e.thinking()
  assert.match(String(snap(e).statusText), /✎ half typed/)
  assert.equal(snap(e).animBase, '')
  e.setPending(null)
  e.thinking()
  assert.ok(snap(e).animBase.length > 0, 'a thinking phrase should animate')
  assert.ok(snap(e).animStart > 0)
})

test('stop clears the animation, the status and the pending text', () => {
  const e = new TuiEditor()
  e.thinking()
  e.setPending('x')
  e.stop()
  assert.equal(snap(e).statusText, '')
  assert.equal(snap(e).animBase, '')
  assert.equal(snap(e).pendingText, null)
})

test('sendPause updates the phase label in place', () => {
  const e = new TuiEditor()
  e.sendPause(12)
  assert.match(String(snap(e).animBase), /12/)
  assert.ok(snap(e).animStart > 0)
  // A second pause keeps animating (no reset of the phase start is required,
  // but the text must update).
  e.sendPause(5)
  assert.match(String(snap(e).animBase), /5/)
})

test('setPending ignores an empty string and keeps null', () => {
  const e = new TuiEditor()
  e.setPending('')
  assert.equal(snap(e).pendingText, null)
  e.setPending('x')
  assert.equal(snap(e).pendingText, 'x')
})

test('printAbove pushes one raw log line per newline', () => {
  const e = new TuiEditor()
  e.printAbove('one' + String.fromCharCode(10) + 'two')
  const log = snap(e).log
  assert.equal(log.length, 2)
  assert.deepEqual(
    log.map((l) => l.text),
    ['one', 'two'],
  )
  assert.ok(log.every((l) => l.raw === true))
})
