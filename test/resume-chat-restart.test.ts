import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// A page restart ("the browser lost the page") must put the operator BACK into
// the dialogue they were in. The old code relaunched the persistent context and
// left it on the BASE url; the URL then carries no chat id, so the next send
// opened a NEW chat and the conversation vanished. The rule is simple enough to
// pin on the source (a live browser is not available in a unit test): BEFORE
// the context is closed the chat id is remembered, and AFTER the relaunch the
// provider re-opens it.

const src = (file: string): string =>
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', file),
    'utf-8',
  )

const body = (source: string, start: string, end: string): string => {
  const a = source.indexOf(start)
  assert.ok(a >= 0, 'missing: ' + start)
  const b = source.indexOf(end, a + start.length)
  assert.ok(b > a, 'missing end: ' + end)
  return source.slice(a, b)
}

for (const file of ['browser.ts', 'glm-browser.ts']) {
  test(file + ': restart remembers the chat and re-opens it', () => {
    const s = body(src(file), 'async restart(', '\n  }')
    const remember = s.indexOf('getCurrentChatId')
    const close = s.indexOf('context.close')
    const reopen = s.indexOf('openChat(chatBefore)')
    assert.ok(remember >= 0, 'the chat id is not read before the restart')
    assert.ok(close > remember, 'the chat id must be read BEFORE the close')
    assert.ok(reopen > close, 'the chat is not re-opened after the relaunch')
  })
}

test('qwen: a relaunch re-opens the pending chat instead of the base url', () => {
  const s = body(src('qwen-browser.ts'), 'async _launchOnce(', '\n  }')
  const resume = s.indexOf('resumeChatId')
  const open = s.indexOf('openChat(')
  assert.ok(resume >= 0, 'the pending chat id is not consulted')
  assert.ok(open > resume, 'the pending chat is not opened')
})

test('the agent loop prefers a resumed chat over a fresh one', () => {
  const s = body(src('agent-loop.ts'), 'if (freshChat) {', '\n  }')
  assert.match(s, /resumeChatId/)
  assert.match(s, /openChat\(resumeId\)/)
  // The fresh-chat call must stay as the FALLBACK.
  assert.match(s, /if \(!reopened\) await browser\.newChat\(\)/)
})

test('index publishes the resumed chat id to the browser', () => {
  const s = src('index.ts')
  assert.match(s, /browser\.resumeChatId = resumeChatId/)
  // /resume-id and /last set it, a new chat clears it.
  assert.match(s, /resumeChatId = id/)
  assert.match(s, /resumeChatId = last\.id/)
  assert.match(s, /await browser\.newChat\(\)\s*\n\s*resumeChatId = null/)
})
