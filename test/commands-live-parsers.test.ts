import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseQueueCommand,
  formatQueueList,
  mergeMessages,
  parseBacklogItems,
  nextBacklogItem,
  buildSlashCommandHints,
  isLiveConfigCommand,
  isLiveThemeCommand,
} from '../src/commands.ts'
import { translate } from '../src/i18n.ts'

const NL = String.fromCharCode(10)
const t = translate('en')

// The INTERCEPTED command parsers (/queue, /config, /theme) and the /improve
// backlog picker, plus the «/» hint builder. A silent regression here makes a
// live command queue until the task ends, picks the WRONG backlog item, or
// shows a bare word (not a slash command) in the hints.

// ---------- /queue ----------

test('parseQueueCommand knows list / clear and their aliases', () => {
  for (const text of ['/queue', '/queue list', '/queue ls', '  /queue LS ']) {
    assert.deepEqual(parseQueueCommand(text), { sub: 'list' }, text)
  }
  for (const text of ['/queue clear', '/queue c', '/queue CLEAN']) {
    assert.deepEqual(parseQueueCommand(text), { sub: 'clear' }, text)
  }
  // An UNKNOWN subcommand falls through to the main loop (which prints usage).
  assert.equal(parseQueueCommand('/queue wat'), null)
  assert.equal(parseQueueCommand('/queue now extra'), null)
  assert.equal(parseQueueCommand('/queues'), null)
  assert.equal(parseQueueCommand('queue'), null)
  assert.equal(parseQueueCommand(undefined as never), null)
})

test('formatQueueList numbers the rows and shows the attachment count', () => {
  const out = formatQueueList([
    { text: 'first' },
    { text: 'second', attachments: [{ path: '/a' }] },
  ] as never)
  assert.deepEqual(out, ['  1. first', '  2. second [+1]'])
  assert.deepEqual(formatQueueList([]), [])
})

test('a queue row is flattened to ONE line', () => {
  const out = formatQueueList([{ text: 'a' + NL + NL + 'b   c ' }] as never)
  assert.deepEqual(out, ['  1. a b c'])
})

test('a long queue row is cut at 80 chars and marked', () => {
  const out = formatQueueList([{ text: 'x'.repeat(100) }] as never)
  assert.equal(out[0], '  1. ' + 'x'.repeat(80) + ' …')
  // EXACTLY 80 chars is not cut (no marker).
  const at = formatQueueList([{ text: 'y'.repeat(80) }] as never)
  assert.equal(at[0], '  1. ' + 'y'.repeat(80))
})

// ---------- batch merge ----------

test('an empty or blank batch merges to nothing', () => {
  assert.deepEqual(mergeMessages([]), { text: '', attachments: [] })
  assert.deepEqual(mergeMessages([{ text: '   ' }] as never), {
    text: '',
    attachments: [],
  })
  assert.deepEqual(mergeMessages(undefined as never), {
    text: '',
    attachments: [],
  })
})

test('a single message is returned verbatim', () => {
  const merged = mergeMessages([
    { text: 'hello [image#1]', attachments: [{ path: '/i' }] },
  ] as never)
  assert.equal(merged.text, 'hello [image#1]')
  assert.equal(merged.attachments?.length, 1)
})

test('the header counts the messages and the parts are separated', () => {
  const merged = mergeMessages([{ text: 'a' }, { text: 'b' }] as never)
  assert.match(
    merged.text,
    /^The operator sent 2 messages while you were working/,
  )
  assert.ok(merged.text.includes('a' + NL + NL + '---' + NL + NL + 'b'))
})

// ---------- live command gates ----------

test('/config is live only for a text subcommand', () => {
  assert.equal(isLiveConfigCommand('/config set ui.theme nord'), true)
  assert.equal(isLiveConfigCommand('/config get ui.theme'), true)
  // The interactive forms pause the editor: they are NOT live.
  assert.equal(isLiveConfigCommand('/config'), false)
  assert.equal(isLiveConfigCommand('/config menu'), false)
  assert.equal(isLiveConfigCommand('/config ui'), false)
  assert.equal(isLiveConfigCommand('config set x'), false)
})

test('/theme is live only WITH an argument', () => {
  assert.equal(isLiveThemeCommand('/theme nord'), true)
  assert.equal(isLiveThemeCommand('  /theme   dracula '), true)
  // The bare form opens the pick list (a pause), so it stays queued.
  assert.equal(isLiveThemeCommand('/theme'), false)
  assert.equal(isLiveThemeCommand('theme nord'), false)
})

// ---------- backlog ----------

test('the backlog parser reads the id, the priority and the done marker', () => {
  const md = [
    '## P1',
    '### A1. first thing',
    '### A2. [x] done thing',
    '## P0',
    '### B1. urgent',
  ].join(NL)
  const items = parseBacklogItems(md)
  assert.deepEqual(
    items.map((i) => [i.id, i.title, i.status, i.priority]),
    [
      ['A1', 'first thing', 'open', 'P1'],
      ['A2', 'done thing', 'done', 'P1'],
      ['B1', 'urgent', 'open', 'P0'],
    ],
  )
})

test('a heading inside a fence or under a strike is not an item', () => {
  const md = [
    '### A1. real',
    '```',
    '### A2. inside a fence',
    '```',
    '### A3. ~~archived copy~~',
  ].join(NL)
  assert.deepEqual(
    parseBacklogItems(md).map((i) => i.id),
    ['A1'],
  )
})

test('an empty heading title falls back to the id', () => {
  const items = parseBacklogItems('### C7. [x]')
  assert.equal(items.length, 1)
  assert.equal(items[0].title, 'C7')
  assert.equal(items[0].status, 'done')
})

test('nextBacklogItem takes the highest priority open item', () => {
  const items = parseBacklogItems(
    ['## P2', '### A1. later', '## P0', '### B1. now', '### B2. [x] done'].join(
      NL,
    ),
  )
  assert.equal(nextBacklogItem(items)?.id, 'B1')
  // An explicit id wins over the priority order, even for a DONE item.
  assert.equal(nextBacklogItem(items, 'a1')?.id, 'A1')
  assert.equal(nextBacklogItem(items, 'B2')?.status, 'done')
  // An unknown id is null, and so is an all-done list.
  assert.equal(nextBacklogItem(items, 'Z9'), null)
  assert.equal(nextBacklogItem(parseBacklogItems('### A1. [x] done')), null)
  assert.equal(nextBacklogItem([]), null)
})

// ---------- slash hints ----------

test('the hints drop dev-only commands unless dev mode is on', () => {
  const prod = buildSlashCommandHints({ devMode: false, t })
  assert.ok(prod.every((h) => !h.name.startsWith('/improve')))
  const dev = buildSlashCommandHints({ devMode: true, t })
  assert.ok(dev.some((h) => h.name === '/improve'))
  assert.ok(dev.length > prod.length)
})

test('a dynamic hint is forced into a slash name and de-duplicated', () => {
  const hints = buildSlashCommandHints({
    devMode: false,
    t,
    dynamic: [
      { name: 'nosl', description: 'custom' },
      { name: '  ', description: 'blank' },
      { name: '/nosl2', description: 'ok' },
      { name: '/NOSL2', description: 'dup by case' },
      // A dynamic name that clashes with a BUILT-IN is skipped.
      { name: '/help', description: 'shadow' },
    ],
  })
  const names = hints.map((h) => h.name)
  assert.ok(names.includes('/nosl'))
  assert.ok(names.includes('/nosl2'))
  assert.equal(names.filter((n) => n.toLowerCase() === '/nosl2').length, 1)
  assert.equal(names.filter((n) => n === '/help').length, 1)
  assert.ok(!names.includes('/'))
})
