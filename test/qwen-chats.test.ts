import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// The Qwen chat-list / restored-dialogue scraping lives in ONE pure module
// (src/qwen-chats.ts) so its policy is auditable and does not drift. These
// checks pin the two fixes found on the live site:
//   * readChatMessages matched BOTH an outer message container and an inner
//     one -> every turn printed TWICE; only the OUTERMOST block is kept now.
//   * the sidebar chat links carry /c/<id>, and the guest pseudo-id 'guest'
//     must never be listed as a resumable chat.

test('scrapeQwenChatMessages de-duplicates nested message blocks', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', 'src', 'qwen-chats.ts'), 'utf-8')
  assert.match(
    src,
    /o\.contains\(b\)/,
    'the nested-block filter (keep the outermost) must be present',
  )
  assert.match(
    src,
    /new Set\(containers\)/,
    'node-identity dedup must be present',
  )
})

test('scrapeQwenChatList skips the guest pseudo-id and de-duplicates', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', 'src', 'qwen-chats.ts'), 'utf-8')
  assert.match(src, /=== 'guest'/, 'the guest id must be filtered out')
  assert.match(src, /seen\.has/, 'duplicate chat links must be collapsed')
  assert.ok(src.includes('/c/'), 'the /c/<id> href shape must be matched')
})

test('the Qwen scraper does not close over module scope (runs in-page)', () => {
  // page.evaluate serializes the function; a module-scope reference would
  // throw at runtime. Guard the two scrapers' bodies for obvious offenders.
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', 'src', 'qwen-chats.ts'), 'utf-8')
  const start = src.indexOf('export function scrapeQwenChatList')
  const end = src.indexOf('export function scrapeQwenChatMessages')
  const body = src.slice(start, end)
  assert.ok(
    !/import\s|\.\.\//.test(body),
    'no module imports inside the scraper',
  )
})

import { parseQwenChatList, parseQwenHistory } from '../src/qwen-chats.ts'

test('parseQwenChatList reads the API shape (data[] with id/title)', () => {
  const list = parseQwenChatList({
    data: [
      { id: 'abc', title: 'First chat' },
      { id: 'def', name: 'Second' },
      { nope: true },
    ],
  })
  assert.deepEqual(list, [
    { id: 'abc', title: 'First chat' },
    { id: 'def', title: 'Second' },
  ])
})

test('parseQwenChatList tolerates data.chats / junk', () => {
  assert.deepEqual(
    parseQwenChatList({ data: { chats: [{ id: 'x', title: 'y' }] } }),
    [{ id: 'x', title: 'y' }],
  )
  assert.deepEqual(parseQwenChatList(null), [])
  assert.deepEqual(parseQwenChatList('nope'), [])
})

test('parseQwenHistory reads content and fragments', () => {
  const msgs = parseQwenHistory({
    data: {
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          fragments: [{ type: 'RESPONSE', content: 'hello' }],
        },
        { role: 'assistant', fragments: [{ type: 'THINK', content: 'skip' }] },
      ],
    },
  })
  assert.deepEqual(msgs, [
    { role: 'user', text: 'hi' },
    { role: 'assistant', text: 'hello' },
  ])
})

test('parseQwenHistory tolerates data[] and junk', () => {
  assert.deepEqual(parseQwenHistory({ data: [{ role: 'user', text: 'x' }] }), [
    { role: 'user', text: 'x' },
  ])
  assert.deepEqual(parseQwenHistory({}), [])
})

test('parseQwenHistory role detection is defensive (is_user / numeric)', () => {
  const msgs = parseQwenHistory({
    data: {
      messages: [
        { is_user: true, content: 'a' },
        { role: 'USER', content: 'b' },
        { role: 'ASSISTANT', content: 'c' },
        { is_user: false, content: 'd' },
      ],
    },
  })
  assert.deepEqual(
    msgs.map((m) => m.role),
    ['user', 'user', 'assistant', 'assistant'],
  )
})
