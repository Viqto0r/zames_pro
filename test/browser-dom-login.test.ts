import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readMfaAccountInDom,
  readLastAnswerInDom,
  submitLoginFormInDom,
  dumpDomCountsInDom,
} from '../src/browser-dom.ts'

// Login-flow DOM helpers. Each runs INSIDE page.evaluate; the stubs replace
// only `document`, so the DECISION is pinned: which element the MFA email is
// read from, that a reasoning block never becomes the answer, that the submit
// click prefers a labelled control but falls back to a primary button, and
// that the DOM dump counts each selector.

function withDoc(doc: Record<string, unknown>): () => void {
  const g = globalThis as unknown as Record<string, unknown>
  const prev = g.document
  g.document = doc
  return () => {
    g.document = prev
  }
}

const NL = String.fromCharCode(10)

test('the MFA account prefers the title attribute over the text', () => {
  const el = {
    getAttribute: (n: string) => (n === 'title' ? 'me@example.com' : null),
    innerText: 'ignored',
  }
  const restore = withDoc({ querySelector: () => el })
  try {
    assert.equal(readMfaAccountInDom(), 'me@example.com')
  } finally {
    restore()
  }
})

test('the MFA account falls back to the text and to an empty string', () => {
  let restore = withDoc({
    querySelector: () => ({
      getAttribute: () => null,
      innerText: '  me@x.io  ',
    }),
  })
  try {
    assert.equal(readMfaAccountInDom(), 'me@x.io')
  } finally {
    restore()
  }
  restore = withDoc({ querySelector: () => null })
  try {
    assert.equal(readMfaAccountInDom(), '')
  } finally {
    restore()
  }
})

test('the last answer skips a reasoning block and collapses blank lines', () => {
  const think = {
    className: 'thought',
    innerText: 'reasoning',
    parentElement: null,
  }
  const answer = {
    className: 'markdown-prose',
    innerText: 'a' + NL + NL + NL + NL + 'b',
    parentElement: null,
  }
  const restore = withDoc({ querySelectorAll: () => [answer, think] })
  try {
    assert.equal(
      readLastAnswerInDom({ sels: ['md'], thinkRe: 'thought' }),
      'a' + NL + NL + 'b',
    )
  } finally {
    restore()
  }
})

test('the last answer is empty when every candidate is reasoning', () => {
  const think = { className: 'thinking', innerText: 'x', parentElement: null }
  const restore = withDoc({ querySelectorAll: () => [think] })
  try {
    assert.equal(readLastAnswerInDom({ sels: ['md'], thinkRe: 'thinking' }), '')
  } finally {
    restore()
  }
})

test('the submit click prefers a LABELLED control', () => {
  const clicks: string[] = []
  const make = (text: string, cls = '') => ({
    textContent: text,
    className: cls,
    getAttribute: () => null,
    click: () => clicks.push(text),
  })
  const btns = [make('Continue', 'primary'), make('Sign in')]
  const restore = withDoc({
    querySelector: () => ({ closest: () => null }),
    querySelectorAll: () => btns,
  })
  try {
    assert.equal(
      submitLoginFormInDom({ pwdSel: 'pw', submitRe: 'sign in' }),
      true,
    )
    assert.deepEqual(clicks, ['Sign in'])
  } finally {
    restore()
  }
})

test('the submit click falls back to the primary button', () => {
  const clicks: string[] = []
  const primary = {
    textContent: 'OK',
    className: 'ds-button--primary',
    getAttribute: () => null,
    click: () => clicks.push('primary'),
  }
  const restore = withDoc({
    querySelector: () => ({ closest: () => null }),
    querySelectorAll: () => [primary],
  })
  try {
    assert.equal(
      submitLoginFormInDom({ pwdSel: 'pw', submitRe: 'sign in' }),
      true,
    )
    assert.deepEqual(clicks, ['primary'])
  } finally {
    restore()
  }
})

test('no password field and no matching control both return false', () => {
  let restore = withDoc({ querySelector: () => null })
  try {
    assert.equal(
      submitLoginFormInDom({ pwdSel: 'pw', submitRe: 'sign in' }),
      false,
    )
  } finally {
    restore()
  }
  restore = withDoc({
    querySelector: () => ({ closest: () => null }),
    querySelectorAll: () => [
      {
        textContent: 'cancel',
        className: '',
        getAttribute: () => null,
        click: () => {},
      },
    ],
  })
  try {
    assert.equal(
      submitLoginFormInDom({ pwdSel: 'pw', submitRe: 'sign in' }),
      false,
    )
  } finally {
    restore()
  }
})

test('the DOM dump counts every selector in its own bucket', () => {
  const counts: Record<string, number> = { a1: 3, s1: 1, i1: 2 }
  const restore = withDoc({
    querySelectorAll: (sel: string) => new Array(counts[sel] || 0).fill({}),
  })
  try {
    assert.deepEqual(
      dumpDomCountsInDom({ answers: ['a1'], stops: ['s1'], inputs: ['i1'] }),
      { answers: { a1: 3 }, stops: { s1: 1 }, inputs: { i1: 2 } },
    )
  } finally {
    restore()
  }
})
