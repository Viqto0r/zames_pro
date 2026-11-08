import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scrapeGlmChatList, scrapeGlmChatMessages } from '../src/glm-chats.ts'

// The GLM scrapers run INSIDE page.evaluate, so they are pinned here with a
// minimal DOM double: `document.querySelectorAll` plus Element textContent /
// className / parentElement / contains / cloneNode / querySelectorAll.
// Real Playwright is never started.

const U = '0e651f21-d9a3-4120-b700-98f423da8af7'

interface FakeEl {
  tag: string
  href?: string
  text: string
  cls: string
  parent: FakeEl | null
  kids: FakeEl[]
  getAttribute(n: string): string | null
  get textContent(): string
  get className(): string
  get parentElement(): FakeEl | null
  contains(o: FakeEl): boolean
  cloneNode(): FakeEl
  querySelectorAll(): FakeEl[]
  remove(): void
}

function el(o: Partial<FakeEl> & { tag?: string } = {}): FakeEl {
  const e: FakeEl = {
    tag: o.tag || 'div',
    href: o.href,
    text: o.text || '',
    cls: o.cls || '',
    parent: o.parent || null,
    kids: o.kids || [],
    getAttribute(n: string) {
      return n === 'href' ? (this.href ?? null) : null
    },
    get textContent() {
      return this.text + this.kids.map((k) => k.textContent).join('')
    },
    get className() {
      return this.cls
    },
    get parentElement() {
      return this.parent
    },
    contains(x: FakeEl) {
      return x === e || e.kids.some((k) => k.contains(x))
    },
    cloneNode() {
      return el({
        tag: e.tag,
        href: e.href,
        text: e.text,
        cls: e.cls,
        kids: e.kids.map((k) => k.cloneNode()),
      })
    },
    querySelectorAll() {
      const out: FakeEl[] = []
      const walk = (n: FakeEl) => {
        for (const k of n.kids) {
          out.push(k)
          walk(k)
        }
      }
      walk(e)
      return out
    },
    remove() {
      if (e.parent) e.parent.kids = e.parent.kids.filter((k) => k !== e)
    },
  }
  return e
}

function withDocument<T>(all: FakeEl[], fn: () => T): T {
  const g = globalThis as unknown as { document?: unknown }
  const prev = g.document
  g.document = { querySelectorAll: () => all }
  try {
    return fn()
  } finally {
    if (prev === undefined) delete g.document
    else g.document = prev
  }
}

test('the chat list keeps only real /c/<uuid> links', () => {
  const all = [
    el({ tag: 'a', href: '/c/' + U, text: '  First\n  chat ' }),
    el({ tag: 'a', href: '/c/not-a-uuid', text: 'junk' }),
    el({ tag: 'a', text: 'no href' }),
  ]
  const out = withDocument(all, () => scrapeGlmChatList(10))
  assert.deepEqual(out, [{ id: U, title: 'First chat' }])
})

test('the chat list is de-duplicated and capped at the limit', () => {
  const all = [
    el({ tag: 'a', href: '/c/' + U, text: 'one' }),
    el({ tag: 'a', href: '/c/' + U, text: 'dup' }),
    el({
      tag: 'a',
      href: '/c/11111111-2222-3333-4444-555555555555',
      text: 'two',
    }),
  ]
  const out = withDocument(all, () => scrapeGlmChatList(1))
  assert.deepEqual(out, [{ id: U, title: 'one' }])
})

test('a chat row without a title gets an empty one', () => {
  const out = withDocument([el({ tag: 'a', href: '/c/' + U })], () =>
    scrapeGlmChatList(5),
  )
  assert.deepEqual(out, [{ id: U, title: '' }])
})

test('the dialogue scraper skips reasoning blocks and nested duplicates', () => {
  const think = el({ tag: 'div', cls: 'thinking-chain', text: 'hmm' })
  const answer = el({ tag: 'div', cls: 'chat-assistant', text: 'Answer' })
  const inner = el({ tag: 'div', cls: 'markdown-prose', text: '' })
  inner.parent = answer
  answer.kids.push(inner)
  const answerWrap = el({
    tag: 'div',
    cls: 'chat-assistant',
    text: '',
    kids: [answer],
  })
  answer.parent = answerWrap
  const question = el({ tag: 'div', cls: 'chat-user', text: 'Question' })

  const all = [answerWrap, answer, question]

  const out = withDocument(all, () =>
    scrapeGlmChatMessages({
      containerSels: ['.chat-user', '.chat-assistant'],
      thinkRe: 'thinking-chain|thought|reason',
      userRe: 'chat-user|user-message',
    }),
  )
  // The nested answer is collapsed into its wrapper (outermost wins) and the
  // user turn is labelled.
  assert.deepEqual(out, [
    { role: 'assistant', text: 'Answer' },
    { role: 'user', text: 'Question' },
  ])
})

test('the dialogue scraper falls back to the next selector and keeps roles', () => {
  const a = el({ tag: 'div', cls: 'chat-assistant', text: 'hi' })
  const out = withDocument([a], () =>
    scrapeGlmChatMessages({
      containerSels: ['.missing', '.chat-assistant'],
      thinkRe: 'thinking-chain',
      userRe: 'chat-user',
    }),
  )
  assert.deepEqual(out, [{ role: 'assistant', text: 'hi' }])
})

test('the dialogue scraper returns nothing without containers', () => {
  const out = withDocument([], () =>
    scrapeGlmChatMessages({ containerSels: ['.x'], thinkRe: 't', userRe: 'u' }),
  )
  assert.deepEqual(out, [])
})
