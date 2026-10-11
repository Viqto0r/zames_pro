import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QwenBrowser } from '../src/qwen-browser.ts'

// The Qwen provider must expose the same ChatProvider surface the agent loop
// relies on, and its health probe must use Qwen's OWN selectors (input/send),
// not DeepSeek's. These tests inject a fake page so no browser is needed.

// A minimal Playwright-page stand-in: the probe adapter calls
// `page.locator(sel).count()` (and `.filter({hasText}).count()` for text
// probes), so the fake mimics exactly that surface.
function fakePage(present: string[], url: string) {
  return {
    url: () => url,
    locator(sel: string) {
      return {
        count: async () => (present.includes(sel) ? 1 : 0),
        filter: () => ({ count: async () => 0 }),
      }
    },
  }
}

const INPUT = 'textarea.message-input-textarea'
const SEND = 'button.send-button'

test('QwenBrowser: probeUiHealth reports a healthy Qwen page', async () => {
  const b = new QwenBrowser()
  b.page = fakePage([INPUT, SEND], 'https://chat.qwen.ai/') as never
  const res = await b.probeUiHealth()
  assert.equal(res.ok, true)
  assert.deepEqual(res.missingCritical, [])
  assert.ok(res.present.includes('input'))
})

test('QwenBrowser: a missing input is a CRITICAL failure', async () => {
  const b = new QwenBrowser()
  // Send is deliberately NOT probed (it only exists after typing), so the
  // INPUT is the critical control.
  b.page = fakePage([SEND], 'https://chat.qwen.ai/') as never
  const res = await b.probeUiHealth()
  assert.equal(res.ok, false)
  assert.deepEqual(res.missingCritical, ['input'])
})

test('QwenBrowser: send is never a probe capability (appears only after typing)', async () => {
  const b = new QwenBrowser()
  b.page = fakePage([INPUT, SEND], 'https://chat.qwen.ai/') as never
  const res = await b.probeUiHealth()
  assert.ok(!res.present.includes('send'))
  assert.ok(!res.missing.includes('send'))
})

test('QwenBrowser: getCurrentChatId ignores the guest pseudo-id', async () => {
  const b = new QwenBrowser()
  b.page = fakePage([], 'https://chat.qwen.ai/c/guest') as never
  assert.equal(await b.getCurrentChatId(), null)
  b.page = fakePage(
    [],
    'https://chat.qwen.ai/c/2a2355b7-90b7-49b2-9c78-a7f59a44ea84',
  ) as never
  assert.equal(
    await b.getCurrentChatId(),
    '2a2355b7-90b7-49b2-9c78-a7f59a44ea84',
  )
})

// The thinking-mode guard: once the desired mode is applied, a further send
// must NOT reopen the `.qwen-thinking-selector` dropdown (that is slow and can
// steal focus from the send button). Before the fix `_appliedThinking` was set
// but never checked, so the dropdown was driven on every send.
test('QwenBrowser: _applyThinkingMode is a no-op once applied', async () => {
  let locatorCalls = 0
  const page = {
    locator() {
      locatorCalls++
      return {
        first() {
          return this
        },
        count: async () => 0,
      }
    },
    waitForTimeout: async () => {},
    keyboard: { press: async () => {} },
  }
  const b = new QwenBrowser({ deepThinking: false })
  b.page = page as never
  // Pretend the wanted mode was already applied to the page.
  b._appliedThinking = 0 // deepThinking=false -> want 0
  await b._applyThinkingMode()
  assert.equal(
    locatorCalls,
    0,
    'the mode dropdown must not be opened when the mode is already applied',
  )
  // A DIFFERENT desired mode must still drive the UI (the guard is keyed on
  // the value, not a one-shot latch).
  b.deepThinking = true
  await b._applyThinkingMode()
  assert.ok(locatorCalls > 0, 'a changed mode must be applied')
})

test('QwenBrowser: toggle state is cached synchronously', () => {
  const b = new QwenBrowser({ deepThinking: false, webSearch: true })
  assert.deepEqual(b.getToggleStatesSync(), {
    deepThinking: false,
    webSearch: true,
  })
  b.setToggleState({ deepThinking: true })
  assert.equal(b.getToggleStatesSync().deepThinking, true)
  assert.equal(b.getToggleStatesSync().webSearch, true)
})

test('QwenBrowser: exposes the ChatProvider contract', () => {
  const b = new QwenBrowser()
  assert.equal(b.providerName, 'qwen')
  for (const m of [
    'ask',
    'newChat',
    'stopGeneration',
    'getCurrentChatId',
    'listChats',
    'openChat',
    'launch',
    'waitForLogin',
    'close',
    'probeUiHealth',
    'dumpDom',
    'readChatMessages',
    'fetchChatMessages',
    'getLastTokenUsage',
    'setLocale',
    'sendIntervalMs',
  ]) {
    assert.equal(
      typeof (b as unknown as Record<string, unknown>)[m],
      'function',
      m,
    )
  }
})
