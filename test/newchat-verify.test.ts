import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser } from '../src/browser.ts'

// newChat / openChat used to swallow errors and never confirm the page
// changed — a failed click then sent the next prompt into the OLD chat. They
// now poll for the input AND verify the chat id actually changed.

function chain(overrides: Record<string, unknown> = {}): unknown {
  const self: Record<string, unknown> = {}
  const base = {
    first: () => self,
    last: () => self,
    filter: () => self,
    nth: () => self,
    click: async () => {},
    count: async () => 1,
    waitFor: async () => {},
    isVisible: async () => true,
    getAttribute: async () => null,
    textContent: async () => '',
    evaluate: async () => ({}),
  }
  Object.assign(self, base, overrides)
  return self
}

// The real DeepSeek "New chat" control is a <div>, not a <button>/<a>. The
// selector must therefore match the div, otherwise the click times out and
// newChat silently no-ops.
const NEW_CHAT_SELECTOR = 'button, a, [role="button"], div, span'

test('newChat clicks the new-chat control and accepts a changed id', async () => {
  const b = new DeepSeekBrowser()
  let id = 'old-chat'
  let clickedSelector = ''
  ;(b as unknown as { page: unknown }).page = {
    locator: (sel: string) => {
      if (sel === NEW_CHAT_SELECTOR) {
        return chain({
          click: async () => {
            clickedSelector = sel
            id = 'new-chat'
          },
        })
      }
      return chain()
    },
    url: () => 'https://chat.deepseek.com/a/chat/s/' + id,
    goto: async () => {},
    waitForTimeout: async () => {},
  }
  await b.newChat()
  assert.equal(clickedSelector, NEW_CHAT_SELECTOR, 'must target the div too')
  assert.equal(await b.getCurrentChatId(), 'new-chat')
})

test('newChat falls back to goto when the click changes nothing', async () => {
  const b = new DeepSeekBrowser()
  let went = false
  let id = 'same-chat'
  ;(b as unknown as { page: unknown }).page = {
    // The new-chat control click does NOT change the chat id.
    locator: (sel: string) =>
      sel === NEW_CHAT_SELECTOR ? chain({ click: async () => {} }) : chain(),
    url: () => 'https://chat.deepseek.com/a/chat/s/' + id,
    goto: async () => {
      went = true
      id = 'after-goto'
    },
    waitForTimeout: async () => {
      await new Promise((r) => setTimeout(r, 0))
    },
  }
  await b.newChat()
  assert.equal(went, true, 'a no-op click must fall back to goto')
})

// A failed click (no control found) must NOT be treated as success: the old
// code accepted `!clicked` and returned with the OLD chat still open — this is
// exactly what made auto-compact loop on the same chat.
test('newChat goes to a fresh chat even when no control is found', async () => {
  const b = new DeepSeekBrowser()
  let went = false
  ;(b as unknown as { page: unknown }).page = {
    locator: () =>
      chain({
        click: async () => {
          throw new Error('no control')
        },
      }),
    url: () => 'https://chat.deepseek.com/a/chat/s/old-chat',
    goto: async () => {
      went = true
    },
    waitForTimeout: async () => {},
  }
  await b.newChat()
  assert.equal(went, true, 'a failed click must fall back to goto')
})

test('newChat clears the stale sniffed chat id after a goto', async () => {
  const b = new DeepSeekBrowser()
  b._netChatId = 'stale-old-chat'
  ;(b as unknown as { page: unknown }).page = {
    locator: () =>
      chain({
        click: async () => {
          throw new Error('no control')
        },
      }),
    // After the goto the URL is the base (no id), so getCurrentChatId() would
    // fall back to the stale sniffed id without the clear.
    url: () => 'https://chat.deepseek.com/',
    goto: async () => {},
    waitForTimeout: async () => {},
  }
  await b.newChat()
  assert.equal(await b.getCurrentChatId(), null)
})
