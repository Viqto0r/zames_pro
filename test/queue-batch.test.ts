import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeMessages, isSlashCommand } from '../src/commands.ts'

// Queued messages: while the agent works, the operator can type several
// messages. Sending each one separately costs N rate-limit pauses and splits
// the thought; we merge the leading PLAIN-TEXT messages into one batch.

test('a single message is returned as-is', () => {
  const m = mergeMessages([{ text: 'привет' }])
  assert.equal(m.text, 'привет')
  assert.deepEqual(m.attachments, [])
})

test('multiple messages are merged with a header and separators', () => {
  const m = mergeMessages([{ text: 'первое' }, { text: 'второе' }])
  assert.ok(m.text.includes('первое'))
  assert.ok(m.text.includes('второе'))
  assert.ok(m.text.indexOf('первое') < m.text.indexOf('второе'))
  assert.match(m.text, /---/)
  assert.match(m.text, /2 messages/)
})

test('empty messages are dropped', () => {
  const m = mergeMessages([{ text: '  ' }, { text: 'ок' }])
  assert.equal(m.text, 'ок')
})

test('markers are RENUMBERED across the batch', () => {
  // Each message numbers its own images from #1; a naive concat would leave
  // two [image#1] for different files. The merge must renumber.
  const m = mergeMessages([
    {
      text: 'look [image#1] and [file#1]',
      attachments: [
        { path: '/a.png', name: 'a.png', mime: 'image/png' },
        { path: '/a.txt', name: 'a.txt', mime: 'text/plain' },
      ],
    },
    {
      text: 'and [image#1] too',
      attachments: [{ path: '/b.png', name: 'b.png', mime: 'image/png' }],
    },
  ])
  assert.ok(m.text.includes('[image#1]'), m.text)
  assert.ok(m.text.includes('[image#2]'), m.text)
  assert.ok(m.text.includes('[file#1]'), m.text)
  assert.equal(m.attachments.length, 3)
  assert.equal(m.attachments[2].path, '/b.png')
})

test('a marker with no matching attachment is left untouched', () => {
  const m = mergeMessages([{ text: 'see [image#9]' }, { text: 'ok' }])
  assert.ok(m.text.includes('[image#9]'))
})

test('isSlashCommand detects commands (trimmed)', () => {
  assert.equal(isSlashCommand('/compact'), true)
  assert.equal(isSlashCommand('  /new '), true)
  assert.equal(isSlashCommand('обычный текст'), false)
  assert.equal(isSlashCommand(''), false)
  // `!command` (direct shell escape) must not be batched into a task.
  assert.equal(isSlashCommand('!git status'), true)
  assert.equal(isSlashCommand('  !ls '), true)
})
