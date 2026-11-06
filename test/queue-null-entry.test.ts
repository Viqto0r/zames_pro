import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatQueueList } from '../src/commands.ts'
import { renderQueueView } from '../src/queue-command.ts'

// `/queue` lists the messages waiting behind the current task. The queue is
// LIVE session state that a hand-built entry (a restored session, a
// `queue.push(null)`) can leave with a null element. `m.text` on null THREW
// `Cannot read properties of null (reading 'text')` out of the command
// dispatcher — the operator lost the whole listing over one broken entry.

const NL = String.fromCharCode(10)

test('a null queue entry does not crash the listing', () => {
  const lines = formatQueueList([null as never, { text: 'ok' } as never])
  assert.equal(lines.length, 2)
  assert.match(lines[1], /ok/)
})

test('renderQueueView still lists the rest', () => {
  const view = renderQueueView('list', 2, [
    null as never,
    { text: 'hello' } as never,
  ])
  assert.equal(view.kind, 'list')
  if (view.kind === 'list') assert.match(view.lines.join(NL), /hello/)
})
