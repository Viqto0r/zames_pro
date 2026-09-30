import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// A11: readChatMessages matched BOTH an outer message container and an inner
// one on some builds, so the restored dialogue printed each turn twice. The
// reader now keeps only the OUTERMOST blocks (drops a block nested in another).

test('readChatMessages de-duplicates nested message blocks', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', 'src', 'browser.ts'), 'utf-8')
  assert.match(
    src,
    /other\.contains\(b\)/,
    'the nested-block filter must be present',
  )
  assert.match(src, /new Set\(blocks\)/, 'node-identity dedup must be present')
})
