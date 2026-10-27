import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusLeftText } from '../src/tui/StatusBar.tsx'
import { stripEllipsis } from '../src/spinner.ts'
import { translate } from '../src/i18n.ts'

// The status row is ONE line: the left status (a counter, a pause, the
// scrolled-up marker) used to be cut at a third of the width even when the
// badge cluster was short, so «⏳ пауза 7с перед отправкой · 5s» showed up as
// «пауза 7с перед отправкой.  · 5…» with the ticker digits gone.

const t = translate('ru')

type Left = Parameters<typeof statusLeftText>[0]

function fake(over: Record<string, unknown> = {}): Left {
  return {
    pendingText: null,
    animBase: '',
    animStart: 0,
    statusText: '',
    scroll: 0,
    busy: false,
    sendState: '',
    locale: 'ru',
    ...over,
  } as unknown as Left
}

test('the scroll marker carries no timer (it is not an animation)', () => {
  const s = fake({ scroll: 3, animBase: '⏳ pause', busy: true })
  assert.equal(statusLeftText(s, t), t('status.scrolled', { n: '3' }))
})

test('an idle status text is returned as is', () => {
  assert.equal(statusLeftText(fake({ statusText: 'Locked' }), t), 'Locked')
})

test('the pending text is echoed with the editing hint', () => {
  const out = statusLeftText(fake({ pendingText: 'hi' }), t)
  assert.ok(out.startsWith('✎ hi'))
})

test('an animated base drops its own ellipsis (the dots redraw it)', () => {
  const out = statusLeftText(fake({ animBase: '⏳ thinking…' }), t)
  assert.ok(out.startsWith(stripEllipsis('⏳ thinking')))
})

test('an empty state renders nothing', () => {
  assert.equal(statusLeftText(fake(), t), '')
})
