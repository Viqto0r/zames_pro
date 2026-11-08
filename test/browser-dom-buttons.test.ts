import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stopButtonVisibleInDom,
  clickStopInDom,
  continueVisibleInDom,
  clickContinueInDom,
} from '../src/browser-dom.ts'

// Stop/Continue detection runs INSIDE page.evaluate. The stubs below replace
// only the DOM globals it reads, so the DECISION is what gets pinned: the Stop
// button is recognised by its label OR by the square icon, while Continue must
// match the EXACT short label (a 'Continue' inside rendered prose is not a
// button) and be laid out (zero-size = hidden overlay twin).

type El = Record<string, any>

function withDom(els: El[], style: Record<string, string> = {}) {
  const g = globalThis as unknown as Record<string, unknown>
  const prev = {
    d: g.document,
    s: g.getComputedStyle,
    m: g.MouseEvent,
    pe: g.PointerEvent,
  }
  class FakeMouse {
    type: string
    constructor(type: string) {
      this.type = type
    }
  }
  g.MouseEvent = FakeMouse
  g.PointerEvent = FakeMouse
  g.document = { querySelectorAll: () => els }
  g.getComputedStyle = () => ({
    display: 'block',
    visibility: 'visible',
    ...style,
  })
  return () => {
    g.document = prev.d
    g.getComputedStyle = prev.s
    g.MouseEvent = prev.m
    g.PointerEvent = prev.pe
  }
}

function el(o: El = {}): El {
  return {
    className: '',
    textContent: '',
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 10, height: 10, left: 1, top: 1 }),
    dispatchEvent: () => true,
    click: () => {},
    ...o,
  }
}

const squareIcon = { querySelector: () => ({}) }

test('the Stop button is found by its aria-label', () => {
  const btn = el({
    className: 'send-btn',
    getAttribute: (n: string) => (n === 'aria-label' ? 'Stop' : null),
  })
  const restore = withDom([btn])
  try {
    assert.equal(stopButtonVisibleInDom('send-btn'), true)
  } finally {
    restore()
  }
})

test('the Stop button is found by the square icon without a label', () => {
  const btn = el({ className: 'btn-x', querySelector: () => squareIcon })
  const restore = withDom([btn])
  try {
    assert.equal(stopButtonVisibleInDom('btn-x'), true)
    assert.equal(stopButtonVisibleInDom('other-class'), false)
  } finally {
    restore()
  }
})

test('an icon without a rect is not a Stop button', () => {
  const arrow = { querySelector: () => null }
  const btn = el({ className: 'btn', querySelector: () => arrow })
  const restore = withDom([btn])
  try {
    assert.equal(stopButtonVisibleInDom('btn'), false)
  } finally {
    restore()
  }
})

test('clickStop dispatches the full pointer sequence and returns true', () => {
  const types: string[] = []
  let clicked = 0
  const btn = el({
    className: 'stop',
    querySelector: () => squareIcon,
    dispatchEvent: (e: { type: string }) => {
      types.push(e.type)
      return true
    },
    click: () => {
      clicked++
    },
  })
  const restore = withDom([btn])
  try {
    assert.equal(clickStopInDom('stop'), true)
    assert.deepEqual(types, [
      'pointerdown',
      'mousedown',
      'pointerup',
      'mouseup',
      'click',
    ])
    assert.equal(clicked, 1)
  } finally {
    restore()
  }
})

test('clickStop ignores a button that is not a stop icon', () => {
  const restore = withDom([
    el({ className: 'send', querySelector: () => null }),
  ])
  try {
    assert.equal(clickStopInDom('send'), false)
  } finally {
    restore()
  }
})

test('Continue must be an EXACT short label, not prose', () => {
  const ok = [
    el({ textContent: 'Continue' }),
    el({ textContent: 'Продолжить' }),
  ]
  const prose = [el({ textContent: 'Continue the task. If you need a tool' })]
  let restore = withDom(ok)
  try {
    assert.equal(continueVisibleInDom(), true)
  } finally {
    restore()
  }
  restore = withDom(prose)
  try {
    assert.equal(continueVisibleInDom(), false)
  } finally {
    restore()
  }
})

test('Continue needs a laid-out button and a visible style', () => {
  const zero = [
    el({
      textContent: 'Continue',
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
    }),
  ]
  let restore = withDom(zero)
  try {
    assert.equal(continueVisibleInDom(), false)
  } finally {
    restore()
  }
  restore = withDom([el({ textContent: 'Continue' })], { visibility: 'hidden' })
  try {
    assert.equal(continueVisibleInDom(), false)
  } finally {
    restore()
  }
})

test('clickContinue clicks the matching laid-out button once', () => {
  let clicked = 0
  const btn = el({
    textContent: 'Continue',
    click: () => {
      clicked++
    },
  })
  const restore = withDom([el({ textContent: 'nope' }), btn])
  try {
    assert.equal(clickContinueInDom(), true)
    assert.equal(clicked, 1)
  } finally {
    restore()
  }
})
