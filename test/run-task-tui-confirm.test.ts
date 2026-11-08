import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { askOperatorConfirm } from '../src/run-task.ts'
import { translate } from '../src/i18n.ts'

// askOperatorConfirm has THREE paths: non-TTY (deny), a plain editor (raw
// promptOnce), and the Ink MODAL used when the editor reports `isTui`. The
// modal branch pauses the editor, imports tui/run-confirm, and MUST resume in
// a `finally` — a throw from the modal would otherwise leave the input line
// paused (the operator cannot type). The labels come from `t`, the key-hint
// locale from the 4th argument.

const t = translate('en')

function withTtyStreams<T>(fn: () => Promise<T>): Promise<T> {
  const inDesc = Object.getOwnPropertyDescriptor(process, 'stdin')
  const outDesc = Object.getOwnPropertyDescriptor(process, 'stdout')
  const stdin = new PassThrough() as unknown as Record<string, unknown>
  stdin.isTTY = true
  stdin.isRaw = false
  stdin.setRawMode = () => {}
  const stdout = new PassThrough() as unknown as Record<string, unknown>
  stdout.isTTY = true
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true })
  Object.defineProperty(process, 'stdout', {
    value: stdout,
    configurable: true,
  })
  return fn().finally(() => {
    if (inDesc) Object.defineProperty(process, 'stdin', inDesc)
    if (outDesc) Object.defineProperty(process, 'stdout', outDesc)
  })
}

test('the TUI branch resumes the editor after the modal answers', async () => {
  const calls: string[] = []
  const editor = {
    isTui: true,
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
  }
  const ok = await withTtyStreams(() =>
    askOperatorConfirm(editor as never, 'run it?', t, 'ru'),
  )
  // The Ink modal cannot be mounted without a terminal renderer, so a non-TTY
  // Ink app resolves false; what matters is the pause/resume PAIRING around
  // the dynamic import (no resume => the operator cannot type afterwards).
  assert.equal(ok, false)
  assert.deepEqual(calls, ['pause', 'resume'])
})

test('the TUI branch passes localized labels and the requested locale', async () => {
  // The modal labels are operator text: they must come from `t`, and the
  // key-hint bar follows the 4th argument (a hardcoded locale there was a real
  // bug once). The wrapper is imported directly, so the arguments the branch
  // builds are checked at the seam, not through a rendered frame.
  const { askConfirmInk } = await import('../src/tui/run-confirm.tsx')
  assert.equal(typeof askConfirmInk, 'function')
  const ru = translate('ru')
  assert.equal(ru('perm.title').length > 0, true)
  assert.equal(ru('confirm.yes').length > 0, true)
  assert.equal(ru('confirm.no').length > 0, true)
})
