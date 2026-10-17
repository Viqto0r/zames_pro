// Qwen's `content_list` is phase-split output: a restored dialogue must keep
// only the ANSWER phase. The `thinking_summary` / reasoning phase is not the
// answer (the live SSE parser already skips it — see qwen-net-capture.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenHistory } from '../src/qwen-chats.ts'

test('parseQwenHistory skips the thinking phase in content_list', () => {
  const msgs = parseQwenHistory({
    data: {
      messages: {
        a: {
          role: 'assistant',
          content: '',
          content_list: [
            { phase: 'thinking_summary', content: 'INTERNAL REASONING' },
            { phase: 'answer', content: 'the answer' },
          ],
          timestamp: 1,
        },
      },
    },
  })
  assert.deepEqual(msgs, [{ role: 'assistant', text: 'the answer' }])
})

test('parseQwenHistory skips a part flagged as reasoning', () => {
  const msgs = parseQwenHistory({
    data: {
      messages: {
        a: {
          role: 'assistant',
          content_list: [
            { type: 'reasoning', content: 'why' },
            { type: 'text', content: 'visible' },
          ],
          timestamp: 1,
        },
      },
    },
  })
  assert.deepEqual(msgs, [{ role: 'assistant', text: 'visible' }])
})
