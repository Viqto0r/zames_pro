import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser } from '../src/browser.ts'

// A relaunch (e.g. the headless User-Agent fix) creates a NEW page. The net
// hook MUST re-attach to it, otherwise the capture stays dead on the new page
// and ask() sees "no answer" — the headless-only failure where headed worked.
function fakePage(): {
  on: (ev: string, fn: unknown) => void
  handlers: Record<string, number>
} {
  const handlers: Record<string, number> = {}
  return {
    handlers,
    on(ev: string) {
      handlers[ev] = (handlers[ev] || 0) + 1
    },
  }
}

function attach(b: DeepSeekBrowser, pg: unknown): void {
  ;(b as unknown as { page: unknown }).page = pg
}

test('net hook re-attaches after the page changes (relaunch)', () => {
  const b = new DeepSeekBrowser()
  const p1 = fakePage()
  attach(b, p1)
  b._installNetHook()
  assert.equal(p1.handlers['response'], 1)
  assert.equal(p1.handlers['request'], 1)

  // Same page: a second call must NOT double-attach (would double-handle
  // every response).
  b._installNetHook()
  assert.equal(p1.handlers['response'], 1)

  // A NEW page (relaunch): the hook must attach to it.
  const p2 = fakePage()
  attach(b, p2)
  b._installNetHook()
  assert.equal(p2.handlers['response'], 1)
  assert.equal(p2.handlers['request'], 1)
})

test('net hook does nothing without a page', () => {
  const b = new DeepSeekBrowser()
  attach(b, null)
  b._installNetHook()
  assert.equal(b._netHookInstalled, false)
})
