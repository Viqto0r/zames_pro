import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  statusLeftText,
  badgeTextWidth,
  statusBadges,
} from '../src/tui/StatusBar.tsx'
import { TuiStore } from '../src/tui/store.ts'
import { translate } from '../src/i18n.ts'
import { DOTS, stripEllipsis } from '../src/spinner.ts'

// test/tui-status-badges.test.ts pins the BADGE row. The LEFT half of the
// status line (`statusLeftText`) and the width arithmetic (`badgeTextWidth`)
// had no test at all, yet they decide what the operator sees while the agent
// works: the typed-but-unsent text, the spinner with its dot phase and timer,
// the generating/settled prefix, the scrolled-up marker, and how much room the
// badges reserve.

const t = translate('en')

function state(over: Record<string, unknown>) {
  const s = new TuiStore()
  s.set(over as never)
  return s.getSnapshot()
}

const HINT = t('spinner.hint')

test('an idle, empty state renders an empty left part', () => {
  assert.equal(statusLeftText(state({}), t), '')
})

test('a plain status text is shown as-is (no hint, no timer)', () => {
  assert.equal(
    statusLeftText(state({ statusText: 'resuming…' }), t),
    'resuming…',
  )
})

test('typed-but-unsent text wins over the spinner and the status text', () => {
  const s = state({
    pendingText: 'half typed',
    animBase: 'Thinking',
    statusText: 'resuming…',
    busy: true,
  })
  const left = statusLeftText(s, t)
  assert.equal(left, '✎ half typed  ·  ' + HINT)
})

test('the spinner shows the dot phase, a padded gap and the hint', () => {
  const s = state({ animBase: 'Thinking…', busy: true, animStart: 0 })
  for (let frame = 0; frame < DOTS.length * 2; frame++) {
    const dots = DOTS[frame % DOTS.length]
    const left = statusLeftText(s, t, frame)
    // The ellipsis of the phrase is stripped so the dots replace it.
    assert.ok(left.startsWith(stripEllipsis('Thinking…') + dots), left)
    // Padded to the widest dot phase (3) so the hint never jumps.
    assert.ok(left.includes(dots + '   '.slice(dots.length)), left)
    assert.ok(left.endsWith('  ·  ' + HINT), left)
  }
})

test('the generating / settled prefix precedes the animated text', () => {
  const gen = state({
    animBase: 'Working',
    busy: true,
    sendState: 'generating',
  })
  assert.ok(
    statusLeftText(gen, t).startsWith(t('state.generating') + ': Working'),
  )
  const settled = state({ statusText: 'done', sendState: 'settled' })
  assert.ok(
    statusLeftText(settled, t).startsWith(t('state.settled') + ': done'),
  )
  // `paused` has NO prefix: the countdown text speaks for itself.
  const paused = state({ statusText: 'pause 12s', sendState: 'paused' })
  assert.equal(statusLeftText(paused, t), 'pause 12s')
})

test('the scrolled-up marker REPLACES the left part and carries no timer', () => {
  const s = state({
    scroll: 5,
    animBase: 'Thinking',
    busy: true,
    animStart: Date.now() - 65_000,
  })
  const left = statusLeftText(s, t)
  assert.equal(left, translate('en')('status.scrolled', { n: '5' }))
  assert.ok(!left.includes('Thinking'))
  // No `1m 05s`-style counter next to the scroll note.
  assert.ok(!/\dm \d\ds|\b\d+s\b/.test(left), left)
})

test('the elapsed timer grows with the phase and stops when not animating', () => {
  const started = Date.now() - 65_000
  const s = state({ animBase: 'Thinking', busy: true, animStart: started })
  assert.match(statusLeftText(s, t), / · 1m 0[45]s/)
  // `busy:false` with no animBase is not animating: no timer even with
  // animStart set.
  const idle = state({ statusText: 'x', animStart: started })
  assert.equal(statusLeftText(idle, t), 'x')
})

test('badgeTextWidth counts what statusBadges renders (and nothing more)', () => {
  const full = state({
    statusLine: 'ci ✓',
    provider: 'DeepSeek',
    queueLength: 2,
    tasks: 'tasks: 1/3',
    thinkingEnabled: true,
    searchEnabled: true,
    contextText: 'ctx: 1k · 1%',
    contextLevel: 'ok',
  })
  const labels = statusBadges(full).map((b) => b.label)
  // The width is the sum of the rendered labels: one source of truth.
  let expected = 0
  for (const l of labels) expected += l.length
  // The toggle glyphs are measured by DISPLAY width (the emoji counts as 2
  // and its text-presentation selector as 0), so the badge row fits a real
  // terminal instead of overflowing by the invisible selector.
  expected -= labels.filter((l) => l.includes('🧠')).length * 2
  assert.equal(badgeTextWidth(full), expected)
  assert.equal(badgeTextWidth(state({})), 0)
})

test('badgeTextWidth adds the context marker and one space per badge', () => {
  const warn = state({ contextText: 'ctx: 900k', contextLevel: 'warn' })
  // `badgeTextWidth` adds ONE trailing space to the plain context text
  // (a separator before whatever follows), while a warn/high marker carries
  // its own: pinned as-is.
  assert.equal(badgeTextWidth(warn), 11) // '▲ ctx: 900k' is 11 columns
  const high = state({ contextText: 'ctx: 900k', contextLevel: 'high' })
  // '⛔' is a NON-emoji-presentation glyph, so it is ONE column here;
  // `visLen` (the display-width source of truth) is what decides.
  assert.equal(badgeTextWidth(high), 12)
  const plain = state({ provider: 'GLM' })
  assert.equal(badgeTextWidth(plain), '[GLM] '.length)
  const queued = state({ queueLength: 3 })
  assert.equal(badgeTextWidth(queued), '⧗3 '.length)
})

test('a WIDE badge is measured by display width, not UTF-16 units', () => {
  // A CJK provider label: 2 display columns per char.
  const wide = state({ provider: '模型' })
  assert.equal(badgeTextWidth(wide), '['.length + 4 + '] '.length)
})

// The elapsed timer under the spinner used to be built by hand with a
// hardcoded "m"/"s", so a Russian UI showed "1m 05s" next to localized labels.
// It now goes through formatDuration + t('dur.*'), the same helper the
// per-task summary uses.
test('the elapsed timer uses the localized duration units', () => {
  const tRu = translate('ru')
  const s = state({
    busy: true,
    animBase: 'Думаю',
    animStart: Date.now() - 65_000,
    locale: 'ru',
  })
  const line = statusLeftText(s, tRu)
  assert.match(line, /1\u043c 05\u0441/, line)
  const sEn = state({
    busy: true,
    animBase: 'Thinking',
    animStart: Date.now() - 65_000,
    locale: 'en',
  })
  assert.match(statusLeftText(sEn, t), /1m 05s/)
})
