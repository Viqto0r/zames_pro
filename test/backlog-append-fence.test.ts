import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendBacklogItem } from '../src/backlog.ts'
import { parseBacklogItems } from '../src/commands.ts'

// BACKLOG.md is MARKDOWN: a note may carry a fenced block that shows the file
// format itself. parseBacklogItems() deliberately skips headings inside a
// fence, but appendBacklogItem() looked for the `## P<n>` section with a plain
// line scan, so a `## P1` inside a fence looked like the real section and the
// new item was inserted INTO the fence of an earlier note — the file became
// structurally broken and `/improve` no longer saw the item.
const NL = String.fromCharCode(10)

const file = [
  '## P2',
  '### N2. a note that documents the format',
  '',
  '```',
  '## P1',
  '```',
  '',
  '### N1. first',
  '',
  '## P1',
  '### N5. real p1 item',
].join(NL)

test('a `## P<n>` inside a fenced block is not the section header', () => {
  const r = appendBacklogItem(file, { title: 'p1 note', priority: 'P1' })
  const fenceStart = r.text.indexOf('```')
  const fenceEnd = r.text.indexOf('```', fenceStart + 3)
  const inserted = r.text.indexOf('### ' + r.id + '.')
  assert.ok(
    inserted > fenceEnd,
    'the item was inserted into the fenced block:' + NL + r.text,
  )
  assert.ok(
    r.text.indexOf('## P1') < inserted,
    'the item is not under the P1 section',
  )
})

test('the appended item is readable by the parser', () => {
  const r = appendBacklogItem(file, { title: 'p1 note', priority: 'P1' })
  const ids = parseBacklogItems(r.text).map((i) => i.id)
  assert.ok(ids.includes(r.id), 'the new item is invisible: ' + ids.join(','))
})

test('an unclosed fence does not make the whole tail a code block', () => {
  const broken = ['## P2', '### N1. x', '```js', 'const a = 1'].join(NL)
  const r = appendBacklogItem(broken, { title: 'still inserted' })
  assert.ok(r.text.includes('### ' + r.id + '.'))
})
