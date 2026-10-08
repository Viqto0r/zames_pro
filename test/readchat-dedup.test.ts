import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// readChatMessages matched BOTH an outer message container and an inner
// one on some builds, so the restored dialogue printed each turn twice. The
// reader now keeps only the OUTERMOST blocks (drops a block nested in another).
// C3: this scraping logic moved from browser.ts to browser-chats.ts
// (scrapeChatMessages), which browser.ts calls via page.evaluate.

test('readChatMessages de-duplicates nested message blocks', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', 'src', 'browser-chats.ts'), 'utf-8')
  assert.match(
    src,
    /other\.contains\(b\)/,
    'the nested-block filter must be present',
  )
  assert.match(src, /new Set\(blocks\)/, 'node-identity dedup must be present')
})
