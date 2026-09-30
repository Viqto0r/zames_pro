import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseQueueCommand,
  formatQueueList,
  hasQueuedJob,
  type QueuedMessage,
} from '../src/commands.ts'

test('parseQueueCommand: bare and list forms', () => {
  assert.deepEqual(parseQueueCommand('/queue'), { sub: 'list' })
  assert.deepEqual(parseQueueCommand('/queue list'), { sub: 'list' })
  assert.deepEqual(parseQueueCommand('/queue ls'), { sub: 'list' })
  assert.deepEqual(parseQueueCommand('  /queue  '), { sub: 'list' })
})

test('parseQueueCommand: clear forms', () => {
  assert.deepEqual(parseQueueCommand('/queue clear'), { sub: 'clear' })
  assert.deepEqual(parseQueueCommand('/queue c'), { sub: 'clear' })
  assert.deepEqual(parseQueueCommand('/queue clean'), { sub: 'clear' })
})

test('parseQueueCommand: rejects non-commands and bad args', () => {
  assert.equal(parseQueueCommand('queue'), null)
  assert.equal(parseQueueCommand('hello'), null)
  assert.equal(parseQueueCommand(''), null)
  // An unknown subcommand falls through to the main-loop usage hint.
  assert.equal(parseQueueCommand('/queue bogus'), null)
  // Other slash-commands are NOT intercepted.
  assert.equal(parseQueueCommand('/compact'), null)
  assert.equal(parseQueueCommand('/queue clear now'), null)
})

test('formatQueueList: one line per message, truncated, with attachment count', () => {
  const long = 'x'.repeat(120)
  const msgs: QueuedMessage[] = [
    { text: 'first message' },
    {
      text: long,
      attachments: [{ path: 'a', name: 'a.png', mime: 'image/png' }],
    },
    { text: '  multi\n line\t text  ' },
  ]
  const lines = formatQueueList(msgs)
  assert.equal(lines.length, 3)
  assert.ok(lines[0].includes('1. first message'))
  // Long text is cut at 80 chars + an ellipsis marker.
  assert.ok(lines[1].includes('…'))
  assert.ok(lines[1].includes('[+1]'))
  // Whitespace (newlines/tabs) is collapsed to single spaces.
  assert.ok(lines[2].includes('multi line text'))
})

test('formatQueueList: empty input yields no lines', () => {
  assert.deepEqual(formatQueueList([]), [])
})

test('hasQueuedJob: detects a job already waiting in the queue', () => {
  const queue = [{ jobId: 1 }, { jobId: 2 }, { text: 'plain' }]
  assert.equal(hasQueuedJob(queue, 1), true)
  assert.equal(hasQueuedJob(queue, 2), true)
  assert.equal(hasQueuedJob(queue, 3), false)
  assert.equal(hasQueuedJob([], 1), false)
})
