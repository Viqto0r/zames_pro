import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askConfirmInk } from '../src/tui/run-confirm.tsx'
import { askQuestionInk } from '../src/tui/run-ask.tsx'
import { selectListInk } from '../src/tui/run-select.tsx'

// The Ink WRAPPER modules (run-confirm / run-ask / run-select) bridge a
// promise-based seam to a modal component. On a NON-TTY run their observable
// contract is the fallback value: a pipe or a redirect has nobody to answer,
// so a guarded action must resolve to the DENY/empty value instead of leaving
// the caller pending forever.

const yesNo = {
  title: 'Permission',
  message: 'run npm test?',
  yesLabel: 'Yes',
  noLabel: 'No',
  locale: 'en' as const,
}

function withNonTty<T>(fn: () => Promise<T>): Promise<T> {
  const inDesc = Object.getOwnPropertyDescriptor(process, 'stdin')
  const outDesc = Object.getOwnPropertyDescriptor(process, 'stdout')
  const fake = (isTTY: boolean) => Object.assign(Object.create(null), { isTTY })
  Object.defineProperty(process, 'stdin', {
    value: fake(false),
    configurable: true,
  })
  Object.defineProperty(process, 'stdout', {
    value: fake(false),
    configurable: true,
  })
  return fn().finally(() => {
    if (inDesc) Object.defineProperty(process, 'stdin', inDesc)
    if (outDesc) Object.defineProperty(process, 'stdout', outDesc)
  })
}

test('askConfirmInk resolves false when there is no TTY', async () => {
  assert.equal(await withNonTty(() => askConfirmInk(yesNo)), false)
})

test('askConfirmInk needs BOTH streams to be a TTY', async () => {
  const inDesc = Object.getOwnPropertyDescriptor(process, 'stdin')
  const outDesc = Object.getOwnPropertyDescriptor(process, 'stdout')
  const fake = (isTTY: boolean) => Object.assign(Object.create(null), { isTTY })
  Object.defineProperty(process, 'stdin', {
    value: fake(true),
    configurable: true,
  })
  Object.defineProperty(process, 'stdout', {
    value: fake(false),
    configurable: true,
  })
  try {
    assert.equal(await askConfirmInk(yesNo), false)
  } finally {
    if (inDesc) Object.defineProperty(process, 'stdin', inDesc)
    if (outDesc) Object.defineProperty(process, 'stdout', outDesc)
  }
})

test('askQuestionInk resolves null when there is no TTY', async () => {
  assert.equal(
    await withNonTty(() =>
      askQuestionInk({
        question: 'which one?',
        options: ['a', 'b'],
        recommended: 0,
        allowText: false,
      }),
    ),
    null,
  )
})

test('selectListInk resolves null when there is no TTY', async () => {
  assert.equal(
    await withNonTty(() =>
      selectListInk({
        title: 'pick',
        items: [{ label: 'one', value: '1' }],
        locale: 'en',
      }),
    ),
    null,
  )
})

test('the wrappers resolve instead of rejecting on a non-TTY run', async () => {
  const results = await withNonTty(() =>
    Promise.all([
      askConfirmInk(yesNo),
      askQuestionInk({
        question: 'q',
        options: [],
        recommended: null,
        allowText: true,
      }),
      selectListInk({ title: 't', items: [], locale: 'en' }),
    ]),
  )
  assert.deepEqual(results, [false, null, null])
})

// run-theme-picker is the SAME promise-over-a-modal seam as the three above,
// but it had no non-TTY test at all: /theme on a pipe or a redirect must
// resolve null (the caller then keeps the current palette) instead of leaving
// the command pending forever.
test('pickThemeInk resolves null when there is no TTY', async () => {
  const { pickThemeInk } = await import('../src/tui/run-theme-picker.tsx')
  assert.equal(
    await withNonTty(() =>
      pickThemeInk({
        themes: ['zames', 'nord'],
        initial: 'zames',
        onPreview: () => {},
      }),
    ),
    null,
  )
})

test('pickThemeInk needs BOTH streams to be a TTY', async () => {
  const { pickThemeInk } = await import('../src/tui/run-theme-picker.tsx')
  const inDesc = Object.getOwnPropertyDescriptor(process, 'stdin')
  const outDesc = Object.getOwnPropertyDescriptor(process, 'stdout')
  const fake = (isTTY: boolean) => Object.assign(Object.create(null), { isTTY })
  Object.defineProperty(process, 'stdin', {
    value: fake(true),
    configurable: true,
  })
  Object.defineProperty(process, 'stdout', {
    value: fake(false),
    configurable: true,
  })
  try {
    assert.equal(
      await pickThemeInk({
        themes: ['zames'],
        initial: 'zames',
        onPreview: () => {},
      }),
      null,
    )
  } finally {
    if (inDesc) Object.defineProperty(process, 'stdin', inDesc)
    if (outDesc) Object.defineProperty(process, 'stdout', outDesc)
  }
})
