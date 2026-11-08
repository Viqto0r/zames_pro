import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readPageToastsInDom, readLoginErrorInDom } from '../src/browser-dom.ts'

// Toasts are how a provider tells the operator WHY a send failed (rate limit,
// wrong password, a captcha). Both readers run inside page.evaluate: they walk
// several selectors, skip HIDDEN elements and JOIN the visible text. Reading a
// hidden twin would make the agent react to a stale notice that the operator
// cannot see.

type El = Record<string, any>

function withDom(
  els: El[],
  style: (e: El) => Record<string, string> = () => ({
    display: 'block',
    visibility: 'visible',
  }),
): () => void {
  const g = globalThis as unknown as Record<string, unknown>
  const prevD = g.document
  const prevS = g.getComputedStyle
  // Each SELECTOR gets its own pass: return the list only for the FIRST one,
  // so a multi-selector reader does not join the same text four times.
  let first = true
  g.document = {
    querySelectorAll: () => {
      if (!first) return []
      first = false
      return els
    },
  }
  g.getComputedStyle = (e: El) => style(e)
  return () => {
    g.document = prevD
    g.getComputedStyle = prevS
  }
}

test('visible toast text is joined', () => {
  const restore = withDom([
    { innerText: 'too frequent' },
    { innerText: 'try later' },
  ])
  try {
    assert.equal(readPageToastsInDom(), ' too frequent try later')
  } finally {
    restore()
  }
})

test('a hidden toast is skipped', () => {
  const restore = withDom(
    [{ innerText: 'hidden' }, { innerText: 'shown' }],
    (e) =>
      e.innerText === 'hidden'
        ? { display: 'none', visibility: 'visible' }
        : { display: 'block', visibility: 'visible' },
  )
  try {
    assert.equal(readPageToastsInDom(), ' shown')
  } finally {
    restore()
  }
})

test('an invisible toast is skipped too', () => {
  const restore = withDom([{ innerText: 'x' }], () => ({
    display: 'block',
    visibility: 'hidden',
  }))
  try {
    assert.equal(readPageToastsInDom(), '')
  } finally {
    restore()
  }
})

test('a login error is trimmed and whitespace-collapsed', () => {
  const restore = withDom([{ innerText: '  Wrong\n  password  ' }])
  try {
    assert.equal(readLoginErrorInDom(), 'Wrong password')
  } finally {
    restore()
  }
})

test('blank and hidden login errors contribute nothing', () => {
  const restore = withDom(
    [{ innerText: '   ' }, { innerText: 'hidden', role: 'hidden' }],
    (e) =>
      e.role === 'hidden'
        ? { display: 'none', visibility: 'visible' }
        : { display: 'block', visibility: 'visible' },
  )
  try {
    assert.equal(readLoginErrorInDom(), '')
  } finally {
    restore()
  }
})

test('several login errors are joined into one line', () => {
  const restore = withDom([{ innerText: 'one' }, { innerText: 'two' }])
  try {
    assert.equal(readLoginErrorInDom(), 'one two')
  } finally {
    restore()
  }
})
