import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readElementText,
  elementTagNameInDom,
  isElementEnabledInDom,
  readInputTrimmedTextInDom,
  readUserAgentInDom,
} from '../src/browser-dom.ts'

// src/browser-dom.ts holds the callbacks that run INSIDE page.evaluate. They
// are self-contained (no module scope), so a jsdom-free fake element is enough
// for the helpers that only touch the element passed in. The page-wide readers
// need a real DOM and are covered by the browser smoke, not here.

interface FakeEl {
  innerText?: string
  value?: string
  textContent?: string
  tagName?: string
  disabled?: boolean
  isContentEditable?: boolean
  className?: string
  ownerDocument?: unknown
  style?: Record<string, string>
  setAttribute?: (k: string, v: string) => void
  getAttribute?: (k: string) => string | null
  focus?: () => void
  dispatchEvent?: (e: unknown) => boolean
  insertText?: (v: string) => void
}

function el(over: FakeEl = {}): HTMLElement {
  return {
    innerText: '',
    textContent: '',
    ...over,
  } as unknown as HTMLElement
}

test('readElementText reads an input value and a contenteditable text', () => {
  assert.equal(
    readElementText(el({ tagName: 'TEXTAREA', value: 'box' })),
    'box',
  )
  assert.equal(
    readElementText(el({ tagName: 'INPUT', value: 'typed' })),
    'typed',
  )
  assert.equal(
    readElementText(el({ tagName: 'DIV', innerText: 'editable' })),
    'editable',
  )
})

test('elementTagNameInDom lowercases the tag', () => {
  assert.equal(elementTagNameInDom(el({ tagName: 'textarea' })), 'textarea')
})

// The real DOM always exposes getAttribute: the fake mirrors it (a bare object
// would throw inside the helper).
const getAttr =
  (over: Record<string, string>) =>
  (k: string): string | null =>
    k in over ? over[k] : null

test('isElementEnabledInDom honours aria-disabled and the disabled class', () => {
  assert.equal(
    isElementEnabledInDom(el({ tagName: 'BUTTON', getAttribute: getAttr({}) })),
    true,
  )
  assert.equal(
    isElementEnabledInDom(
      el({
        tagName: 'BUTTON',
        getAttribute: (k: string) => (k === 'aria-disabled' ? 'true' : null),
      }),
    ),
    false,
  )
  assert.equal(
    isElementEnabledInDom(
      el({
        tagName: 'DIV',
        className: 'btn is-disabled',
        getAttribute: getAttr({}),
      }),
    ),
    false,
  )
})

test('readInputTrimmedTextInDom prefers value, then innerText', () => {
  assert.equal(
    readInputTrimmedTextInDom(
      el({ value: '  hi  ' }) as unknown as HTMLTextAreaElement,
    ),
    'hi',
  )
  assert.equal(
    readInputTrimmedTextInDom(
      el({
        value: '',
        innerText: '  fallback ',
      }) as unknown as HTMLTextAreaElement,
    ),
    'fallback',
  )
})

test('readUserAgentInDom returns the page navigator agent', () => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'TestUA/1' },
    configurable: true,
  })
  try {
    assert.equal(readUserAgentInDom(), 'TestUA/1')
  } finally {
    if (prev) Object.defineProperty(globalThis, 'navigator', prev)
    else delete (globalThis as Record<string, unknown>).navigator
  }
})
