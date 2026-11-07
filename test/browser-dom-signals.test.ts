import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chatSignalInDom,
  continueVisibleCheapInDom,
  findLoginInputIndexInDom,
  setBusyTitleInDom,
} from '../src/browser-dom.ts'

// These callbacks run INSIDE page.evaluate, so they touch `document`/`window`
// globals. The stubs below replace only what each callback reads — the point is
// the DECISION (what counts as a signal, a visible button, a login input), not
// a real browser.

type Stub = { restore: () => void }

function withDom(
  doc: Record<string, unknown>,
  win: Record<string, unknown> = {},
): Stub {
  const g = globalThis as unknown as Record<string, unknown>
  const prevDoc = g.document
  const prevWin = g.window
  const prevStyle = g.getComputedStyle
  g.document = doc
  g.window = win
  g.getComputedStyle = () => ({ display: 'block', visibility: 'visible' })
  return {
    restore: () => {
      g.document = prevDoc
      g.window = prevWin
      g.getComputedStyle = prevStyle
    },
  }
}

function el(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    innerText: '',
    textContent: '',
    className: '',
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 10, height: 10 }),
    click: () => {},
    ...over,
  }
}

test('chatSignal counts the nodes and the LAST answer length', () => {
  const doc = {
    querySelectorAll: (sel: string) =>
      sel === 'nodes'
        ? [{}, {}, {}]
        : [{ innerText: 'a' }, { innerText: 'answer!' }],
  }
  const s = withDom(doc)
  try {
    assert.deepEqual(chatSignalInDom({ nodesSel: 'nodes', mdSel: 'md' }), {
      nodes: 3,
      lastLen: 7,
    })
  } finally {
    s.restore()
  }
})

test('chatSignal without answers reports zero length', () => {
  const doc = { querySelectorAll: () => [] }
  const s = withDom(doc)
  try {
    assert.deepEqual(chatSignalInDom({ nodesSel: 'n', mdSel: 'm' }), {
      nodes: 0,
      lastLen: 0,
    })
  } finally {
    s.restore()
  }
})

test('continueVisibleCheap finds a matching, laid-out button', () => {
  const btn = el({ textContent: 'Continue' })
  const s = withDom({ querySelectorAll: () => [btn] })
  try {
    assert.equal(continueVisibleCheapInDom('continue'), true)
  } finally {
    s.restore()
  }
})

test('continueVisibleCheap skips a non-matching, hidden or collapsed button', () => {
  const s = withDom({
    querySelectorAll: () => [
      el({ textContent: 'Stop' }),
      el({
        textContent: 'Continue',
        getBoundingClientRect: () => ({ width: 0, height: 0 }),
      }),
    ],
  })
  try {
    assert.equal(continueVisibleCheapInDom('continue'), false)
  } finally {
    s.restore()
  }
})

test('findLoginInputIndex points at the text input BEFORE the password', () => {
  const user = el({ type: 'text' })
  const pwd = el({ type: 'password' })
  const after = el({ type: 'text' })
  const doc = {
    querySelector: () => pwd,
    querySelectorAll: () => [user, pwd, after],
  }
  const s = withDom(doc)
  try {
    assert.equal(findLoginInputIndexInDom('input[type=password]'), 0)
  } finally {
    s.restore()
  }
})

test('findLoginInputIndex falls back to -1 with no usable input', () => {
  const s = withDom({ querySelector: () => null })
  try {
    assert.equal(findLoginInputIndexInDom('input[type=password]'), -1)
  } finally {
    s.restore()
  }
})

test('an email input counts as a login input too', () => {
  const email = el({ type: 'email' })
  const pwd = el({ type: 'password' })
  const s = withDom({
    querySelector: () => pwd,
    querySelectorAll: () => [email, pwd],
  })
  try {
    assert.equal(findLoginInputIndexInDom('p'), 0)
  } finally {
    s.restore()
  }
})

test('setBusyTitle saves the ORIGINAL title once and restores it', () => {
  const doc = { title: 'my chat' }
  const win: Record<string, unknown> = {}
  const s = withDom(doc, win)
  try {
    setBusyTitleInDom(true)
    assert.equal(doc.title, '⏳ my chat')
    // A SECOND busy call must not stack the marker.
    setBusyTitleInDom(true)
    assert.equal(doc.title, '⏳ my chat')
    setBusyTitleInDom(false)
    assert.equal(doc.title, 'my chat')
    assert.equal(win.__zamesTitle, undefined)
  } finally {
    s.restore()
  }
})

test('setBusyTitle(false) without a saved title changes nothing', () => {
  const doc = { title: 'untouched' }
  const s = withDom(doc, {})
  try {
    setBusyTitleInDom(false)
    assert.equal(doc.title, 'untouched')
  } finally {
    s.restore()
  }
})
