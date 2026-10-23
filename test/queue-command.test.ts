import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderQueueView } from '../src/queue-command.js'
import type { QueuedMessage } from '../src/commands.js'

function msg(text: string, attachments = 0): QueuedMessage {
  return {
    text,
    attachments: Array.from({ length: attachments }, (_, i) => ({
      path: '/tmp/a' + i,
      name: 'a' + i,
      mime: 'image/png',
    })),
  } as QueuedMessage
}

test('renderQueueView: an unrecognized subcommand is a usage error', () => {
  assert.deepEqual(renderQueueView(null, 3, [msg('x')]), { kind: 'usage' })
})

test('renderQueueView: clear reports the CURRENT length', () => {
  assert.deepEqual(renderQueueView('clear', 5, [msg('a')]), {
    kind: 'cleared',
    n: 5,
  })
  // Clearing an already-empty queue is still a successful clear of 0.
  assert.deepEqual(renderQueueView('clear', 0, []), {
    kind: 'cleared',
    n: 0,
  })
})

test('renderQueueView: an empty queue on list is "empty", not a header', () => {
  assert.deepEqual(renderQueueView('list', 0, []), { kind: 'empty' })
  // A count/queue mismatch must not print a header without lines.
  assert.deepEqual(renderQueueView('list', 2, []), { kind: 'empty' })
})

test('renderQueueView: list shows one numbered line per message', () => {
  const r = renderQueueView('list', 2, [msg('first'), msg('second', 2)])
  assert.equal(r.kind, 'list')
  const lines = (r as { lines: string[] }).lines
  assert.equal(lines.length, 2)
  assert.match(lines[0], /1\. first/)
  assert.match(lines[1], /2\. second \[\+\d\]/)
})

test('renderQueueView: a very long message is truncated, not echoed whole', () => {
  const r = renderQueueView('list', 1, [msg('x'.repeat(500))])
  assert.equal(r.kind, 'list')
  const line = (r as { lines: string[] }).lines[0]
  assert.ok(line.length < 120, 'line must be capped: ' + line.length)
  assert.match(line, /\u2026/)
})
