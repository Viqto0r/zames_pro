import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GlmBrowser } from '../src/glm-browser.ts'

// GlmBrowser without a real browser: only the surface the agent loop and the
// UI reach for on a plain (idle) page is pinned here. A fake `page` answers
// locator()/url()/evaluate() the way z.ai's DOM does (see glm-ui.ts), so a
// selector drift is caught by unit tests, not by a hung task.

interface FakeEl {
  count: number
  visible: boolean
}

function fakeBrowser(opts: {
  url?: string
  counts?: Record<string, number>
} = {}): GlmBrowser {
  const b = new GlmBrowser({ headless: true, locale: 'en' })
  const counts = opts.counts || {}
  const makeLocator = (sel: string): Record<string, unknown> => {
    const hit = counts[sel] ?? (sel === 'textarea#chat-input' ? 1 : 0)
    const loc: Record<string, unknown> = {
      count: async () => hit,
      last: () => makeLocator(sel),
      first: () => makeLocator(sel),
      nth: () => makeLocator(sel),
      isVisible: async () => hit > 0,
      filter: () => makeLocator(sel),
    }
    return loc
  }
  const page = {
    url: () => opts.url || 'https://chat.z.ai/',
    locator: (sel: string) => makeLocator(sel),
    evaluate: async (fn: unknown) => {
      // readLastAnswerInDom / chatSignalInDom / toasts: empty page.
      const src = String(fn)
      if (src.includes('document.querySelectorAll')) return ''
      return 0
    },
    waitForTimeout: async () => {},
    on: () => {},
  }
  ;(b as unknown as { page: unknown }).page = page
  return b
}

test('providerName, interval and toggles follow the config', () => {
  const b = new GlmBrowser({
    headless: true,
    minSendIntervalMs: 0,
    deepThinking: false,
    webSearch: false,
    locale: 'en',
  })
  assert.equal(b.providerName, 'glm')
  assert.equal(b.sendIntervalMs(), 0)
  assert.deepEqual(b.getToggleStatesSync(), {
    deepThinking: false,
    webSearch: false,
  })
  b.setToggleState({ deepThinking: true })
  assert.equal(b.getToggleStatesSync().deepThinking, true)
})

test('getCurrentChatId reads the /c/<uuid> URL', async () => {
  const b = fakeBrowser({
    url: 'https://chat.z.ai/c/0e651f21-d9a3-4120-b700-98f423da8af7',
  })
  assert.equal(
    await b.getCurrentChatId(),
    '0e651f21-d9a3-4120-b700-98f423da8af7',
  )
})

test('getCurrentChatId is null on the landing page without a net id', async () => {
  const b = fakeBrowser({ url: 'https://chat.z.ai/' })
  assert.equal(await b.getCurrentChatId(), null)
})

test('probeUiHealth finds the input on an idle page', async () => {
  const b = fakeBrowser()
  const h = await b.probeUiHealth()
  assert.equal(h.ok, true)
  assert.deepEqual(h.missingCritical, [])
})

test('probeUiHealth reports a MISSING input as critical', async () => {
  const b = fakeBrowser({ counts: { 'textarea#chat-input': 0 } })
  const h = await b.probeUiHealth()
  assert.equal(h.ok, false)
  assert.ok(h.missingCritical.includes('input'))
})

test('the UI capability list probes only ALWAYS-present controls', () => {
  const b = new GlmBrowser({ headless: true, locale: 'en' })
  const caps = b._uiCapabilities()
  const critical = caps.filter((c) => c.critical).map((c) => c.capability)
  // The send button appears only after text is typed, so it must NOT be
  // critical (a probe on an idle page would report a false negative).
  assert.deepEqual(critical, ['input'])
})
