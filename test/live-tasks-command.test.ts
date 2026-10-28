import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { isLiveConfigCommand } from '../src/commands.ts'

// The operator typed `/tasks` WHILE the agent was working and it went into the
// send QUEUE — the whole point of the command is to see what the agent is doing
// right now, so it must be handled LIVE (like /queue, /thinking, /theme <id>,
// /config <sub> and /goal). The busy onSubmit branch is the one place that
// decides what may run mid-run, so the rule is pinned on it.

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.ts'),
  'utf-8',
)

function busyBranch(): string {
  const start = src.indexOf('if (ed.busy) {')
  assert.ok(start > 0, 'the busy onSubmit branch is missing')
  const end = src.indexOf('const attachments = (items || [])', start)
  assert.ok(end > start, 'the branch end marker is missing')
  return src.slice(start, end)
}

test('/tasks is handled live, not queued', () => {
  const branch = busyBranch()
  assert.match(
    branch,
    /\/\^\\\/tasks\\s\*\$\/i\.test\(text\.trim\(\)\)/,
    '/tasks is not intercepted in the busy branch (it would be queued)',
  )
  assert.match(branch, /getTodos\(todoStore\)/)
  assert.match(branch, /renderTodos\(items\)/)
  // It must RETURN: falling through would push the command into the queue.
  const tasksAt = branch.indexOf('/tasks')
  const rest = branch.slice(tasksAt)
  assert.match(rest, /\n\s*return\n/, '/tasks must return after printing')
})

test('the other live commands are still intercepted', () => {
  const branch = busyBranch()
  for (const marker of [
    'parseQueueCommand',
    'parseLiveToggle',
    'isLiveConfigCommand',
    'isLiveThemeCommand',
    '/goal',
  ]) {
    assert.ok(branch.includes(marker), 'lost a live command: ' + marker)
  }
})

test('a normal message still goes into the queue', () => {
  assert.match(src, /pendingQueue\.push\(msg\)/)
})

test('isLiveConfigCommand keeps meaning what it says', () => {
  // A sanity check on the helper the branch delegates to.
  assert.equal(typeof isLiveConfigCommand, 'function')
})
