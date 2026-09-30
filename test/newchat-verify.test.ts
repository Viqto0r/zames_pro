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

test('newChat falls back to goto when the click changes nothing', async () => {
  const b = new DeepSeekBrowser()
  let went = false
  let id = 'same-chat'
  ;(b as unknown as { page: unknown }).page = {
    // The new-chat button click does NOT change the chat id.
    locator: (sel: string) =>
      sel === 'button, a' ? chain({ click: async () => {} }) : chain(),
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

test('newChat returns once the input is ready on a fresh chat', async () => {
  const b = new DeepSeekBrowser()
  let id = 'old-chat'
  ;(b as unknown as { page: unknown }).page = {
    locator: (sel: string) =>
      sel === 'button, a'
        ? chain({
            click: async () => {
              id = 'new-chat'
            },
          })
        : chain(),
    url: () => 'https://chat.deepseek.com/a/chat/s/' + id,
    goto: async () => {},
    waitForTimeout: async () => {},
  }
  await b.newChat()
  assert.equal(await b.getCurrentChatId(), 'new-chat')
})
