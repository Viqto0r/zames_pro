import { test } from 'node:test'
import { PassThrough } from 'node:stream'
import assert from 'node:assert/strict'
import { translate } from '../src/i18n.ts'

// runTask drives the editor's lifecycle: busy while the agent works, paused
// ONLY for the blocking y/N confirmation (an Ink modal and the input line must
// not fight for the same keys), and unpaused afterwards even when the
// confirmation throws. A stuck `paused` leaves the operator unable to type, so
// the pairing is pinned here with a fake editor (run-task.test.ts covers the
// queue and the exit codes).

const t = translate('en')

function makeEditor(isTui: boolean) {
  const calls: string[] = []
  const editor = {
    busy: false,
    locked: false,
    isTui,
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    printAbove: () => {},
    lock: () => calls.push('lock'),
    unlock: () => calls.push('unlock'),
    setStatus: () => {},
  }
  return { editor, calls }
}

// The y/N prompt reads stdin; a non-TTY runner makes the Ink/TTY branches
// unreachable, so `askOperatorConfirm` denies. These tests therefore pin the
// DENIAL contract: a non-TTY run must never silently allow a guarded call.
import { askOperatorConfirm } from '../src/run-task.ts'

test('askOperatorConfirm denies without a TTY', async () => {
  const wasIn = process.stdin.isTTY
  const wasOut = process.stdout.isTTY
  Object.defineProperty(process.stdin, 'isTTY', {
    value: false,
    configurable: true,
  })
  Object.defineProperty(process.stdout, 'isTTY', {
    value: false,
    configurable: true,
  })
  try {
    assert.equal(await askOperatorConfirm(null, 'allow?'), false)
    // Even with an editor attached: no TTY means no answer, and a guarded
    // tool must NOT run.
    const { editor } = makeEditor(true)
    assert.equal(await askOperatorConfirm(editor as never, 'allow?'), false)
  } finally {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: wasIn,
      configurable: true,
    })
    Object.defineProperty(process.stdout, 'isTTY', {
      value: wasOut,
      configurable: true,
    })
  }
})

test('askOperatorConfirm pauses and resumes an editor when a TTY answers yes', async () => {
  // Drive the TTY branch with a fake stdin/stdout pair: `promptOnce` reads
  // raw keystrokes, so the fake emits 'y' + Enter and then ends.
  const wasIn = process.stdin.isTTY
  const wasOut = process.stdout.isTTY
  const origStdin = Object.getOwnPropertyDescriptor(process, 'stdin')
  const origStdout = Object.getOwnPropertyDescriptor(process, 'stdout')
  const stream = new PassThrough()
  const stdin = stream as unknown as Record<string, unknown>
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
  try {
    const { editor, calls } = makeEditor(false)
    const p = askOperatorConfirm(editor as never, 'allow?')
    stream.write('y' + String.fromCharCode(10))
    assert.equal(await p, true)
    assert.deepEqual(calls, ['pause', 'resume'])
  } finally {
    if (origStdin) Object.defineProperty(process, 'stdin', origStdin)
    if (origStdout) Object.defineProperty(process, 'stdout', origStdout)
    Object.defineProperty(process.stdin, 'isTTY', {
      value: wasIn,
      configurable: true,
    })
    Object.defineProperty(process.stdout, 'isTTY', {
      value: wasOut,
      configurable: true,
    })
  }
})

test('askOperatorConfirm resumes the editor even when the read fails', async () => {
  const wasIn = process.stdin.isTTY
  const wasOut = process.stdout.isTTY
  Object.defineProperty(process.stdin, 'isTTY', {
    value: true,
    configurable: true,
  })
  Object.defineProperty(process.stdout, 'isTTY', {
    value: true,
    configurable: true,
  })
  const origStdin = Object.getOwnPropertyDescriptor(process, 'stdin')
  const stream = new PassThrough()
  const stdin = stream as unknown as Record<string, unknown>
  stdin.isTTY = true
  stdin.isRaw = false
  stdin.setRawMode = () => {
    throw new Error('raw mode refused')
  }
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true })
  try {
    const { editor, calls } = makeEditor(false)
    const ok = await askOperatorConfirm(editor as never, 'allow?')
    assert.equal(ok, false)
    assert.deepEqual(calls, ['pause', 'resume'])
  } finally {
    if (origStdin) Object.defineProperty(process, 'stdin', origStdin)
    Object.defineProperty(process.stdin, 'isTTY', {
      value: wasIn,
      configurable: true,
    })
    Object.defineProperty(process.stdout, 'isTTY', {
      value: wasOut,
      configurable: true,
    })
  }
})
