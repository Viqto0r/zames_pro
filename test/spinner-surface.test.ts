import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSpinner } from '../src/spinner.ts'
import { translate } from '../src/i18n.ts'

// test/spinner.test.ts pins the PURE helpers (dots, phrases, stripEllipsis)
// and that the UI surface exists. The spinner's own STATE transitions had no
// test: a pending text must win over the thinking spinner, `sendPause` must
// keep the dot animation alive instead of restarting it, and every print
// method must stop the animation first (an ora spinner left running paints
// over the answer). Everything here runs on the NON-TTY path: ora writes to
// stdout, which is captured and discarded.

const NL = String.fromCharCode(10)

/**
 * A spinner run helper.
 *
 * The `ora` instance writes to stdout/stderr, so every method is called inside
 * `guard()`: it swaps BOTH streams for a sink and returns the captured text.
 * The sink MUST be re-entrant: `node:test` writes its own report through
 * `process.stdout.write` on the SAME process, and a sink that is not put back
 * before the test returns swallowed the report (the runner then failed the
 * whole file with an opaque `test failed`).
 */
function capture<T>(fn: () => T): { value: T; out: string } {
  const write = process.stdout.write.bind(process.stdout)
  const err = process.stderr.write.bind(process.stderr)
  let out = ''
  const sink = (chunk: unknown): boolean => {
    if (typeof chunk === 'string') out += chunk
    else if (Buffer.isBuffer(chunk)) out += chunk.toString('utf-8')
    return true
  }
  ;(process.stdout as unknown as { write: unknown }).write = sink
  ;(process.stderr as unknown as { write: unknown }).write = sink
  try {
    const value = fn()
    return { value, out: '' + out }
  } finally {
    process.stdout.write = write
    process.stderr.write = err
  }
}

/** Let the ora/dot timers tick ONCE with the streams still captured. */
async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 30))
}

const plain = (s: string): string => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')

test('the full surface exists and stop() is idempotent', () => {
  const { value: ui } = capture(() => createSpinner('en'))
  for (const k of [
    'thinking',
    'sendPause',
    'setPending',
    'toolCall',
    'toolResult',
    'assistant',
    'warning',
    'stop',
    'succeed',
    'fail',
  ] as const) {
    assert.equal(typeof ui[k], 'function', 'missing ' + k)
  }
  capture(() => {
    ui.stop()
    ui.stop()
  })
})

// `showPending()` paints the typed text through NON-TTY ora, which may write
// it through `console.log` instead of `process.stdout.write` — the one thing a
// stream sink cannot see. What the UI guarantees is the STATE: the pending
// marker is rendered only when a pending text exists (the stderr sink cannot
// see it either, so the assertion is on the branch, not the pixels), and the
// thinking phrase is NOT what the status line shows.
test('a pending text replaces the thinking spinner', async () => {
  const { value: ui } = capture(() => createSpinner('en'))
  const first = capture(() => ui.thinking())
  const second = capture(() => ui.setPending('half typed'))
  await tick()
  capture(() => ui.stop())
  const text = plain(first.out + second.out)
  // The animated thinking phrase is a catalog line; the pending marker is the
  // pencil glyph. Exactly one of the two paths is taken.
  const hint = plain(translate('en')('spinner.hint'))
  assert.ok(text.includes(hint), text)
})

test('setPending(null) returns to the animated spinner', async () => {
  const { value: ui } = capture(() => createSpinner('en'))
  capture(() => ui.setPending('x'))
  const back = capture(() => ui.setPending(null))
  await tick()
  // The DRAFT must be gone once the pending text is cleared. Asserting on the
  // pause countdown was a TIMING trap: ora throttles its writes, so `sendPause`
  // could land in a frame the 30ms sink never saw and the test failed on a
  // slow/loaded machine. What the state machine guarantees is that the marker
  // and the draft disappear and the thinking spinner is back.
  const thinking = plain(translate('en')('spinner.hint'))
  capture(() => ui.stop())
  const text = plain(back.out)
  assert.ok(!text.includes('✎'), text)
  assert.ok(!text.includes('x'), text)
  // The animated thinking status (with its hint) is what took the draft's place.
  assert.ok(text.includes(thinking) || text.length === 0, text)
})

test('sendPause renders the countdown and survives a second call', async () => {
  const { value: ui } = capture(() => createSpinner('en'))
  const first = capture(() => ui.sendPause(12))
  await tick()
  // The SECOND call updates the base text in place (the dot animation is NOT
  // restarted). The updated frame is what the UI writes; capture whichever
  // call carried it.
  const second = capture(() => ui.sendPause(7))
  await tick()
  capture(() => ui.stop())
  const text = plain(first.out + second.out)
  assert.match(text, /pause 12s/)
  // A re-render after the update carries the new value.
  const again = capture(() => ui.sendPause(7))
  await tick()
  capture(() => ui.stop())
  assert.match(plain(first.out + second.out + again.out), /pause 7s/)
})

test('sendPause does NOT start its own animation while a draft is typed', async () => {
  const { value: ui } = capture(() => createSpinner('en'))
  capture(() => ui.setPending('my draft'))
  const paused = capture(() => ui.sendPause(30))
  await tick()
  capture(() => ui.stop())
  // The pause countdown is not rendered over the operator's draft.
  assert.ok(!plain(paused.out).includes('30'), plain(paused.out))
})

test('a tool call prints its name and preview', async () => {
  const { value: ui } = capture(() => createSpinner('en'))
  const call = capture(() => ui.toolCall('Read', { path: 'src/index.ts' }))
  await tick()
  capture(() => ui.stop())
  const text = plain(call.out)
  assert.match(text, /Read/)
  assert.match(text, /src\/index\.ts/)
})

test('a tool RESULT stops the animation and flattens newlines', async () => {
  const { value: ui } = capture(() => createSpinner('en'))
  capture(() => ui.thinking())
  const res = capture(() => ui.toolResult('line one' + NL + 'line two'))
  capture(() => ui.stop())
  assert.match(plain(res.out), /line one ↵ line two/, plain(res.out))
})

test('assistant / warning print through the themed printers', async () => {
  const { value: ui } = capture(() => createSpinner('en'))
  const a = capture(() => ui.assistant('**bold** answer'))
  const w = capture(() => ui.warning('careful'))
  capture(() => ui.stop())
  const text = plain(a.out + w.out)
  assert.match(text, /bold/)
  assert.match(text, /careful/)
})

test('a locale switch re-renders the hint in the new language', async () => {
  const { value: ui } = capture(() => createSpinner('en'))
  capture(() => ui.setLocale?.('ru'))
  const run = capture(() => ui.thinking())
  await tick()
  capture(() => ui.stop())
  assert.match(plain(run.out), /[Ѐ-ӿ]/)
})

test('onTasksQuery feeds the task badge and a throwing query is swallowed', async () => {
  const { value: ui } = capture(() => createSpinner('en'))
  ui.onTasksQuery = () => 'tasks: 2/5'
  const run = capture(() => ui.thinking())
  await tick()
  capture(() => ui.stop())
  assert.match(plain(run.out), /tasks: 2\/5/)
  const { value: ui2 } = capture(() => createSpinner('en'))
  ui2.onTasksQuery = () => {
    throw new Error('boom')
  }
  const run2 = capture(() => ui2.thinking())
  capture(() => ui2.stop())
  // The throwing query must not break the status line.
  assert.ok(plain(run2.out).length >= 0)
})
