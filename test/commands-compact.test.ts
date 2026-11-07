import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isUsableCompactSummary,
  renderCompactTodos,
  renderCompactGoal,
  buildCompactCarryover,
} from '../src/commands.ts'

const NL = String.fromCharCode(10)

// The /compact seam: which summary may be carried into the new chat and how
// the carried block is assembled. The prose-vs-tool-call and spoofing edge
// cases have their own two files; this one pins the CORE rules.

const GOOD =
  'The agent read the parser, found the bug in the argument splitter and ' +
  'fixed it with a unit test.'

test('a normal summary of a sensible length is usable', () => {
  assert.equal(isUsableCompactSummary(GOOD), true)
})

test('an empty or too-short summary is unusable', () => {
  assert.equal(isUsableCompactSummary(''), false)
  assert.equal(isUsableCompactSummary('   '), false)
  assert.equal(isUsableCompactSummary('done'), false)
  assert.equal(isUsableCompactSummary(undefined as unknown as string), false)
})

test('the abort sentinel is not a summary', () => {
  assert.equal(isUsableCompactSummary('(прервано пользователем)'), false)
})

test('a safety-block CLOSING marker rejects the summary', () => {
  assert.equal(isUsableCompactSummary(GOOD + '</ds_safety>'), false)
})

test('a bare tool-call body with args is rejected', () => {
  assert.equal(
    isUsableCompactSummary(GOOD + NL + '"args": { "path": "x" }'),
    false,
  )
})

test('renderCompactTodos is empty without tasks', () => {
  assert.equal(renderCompactTodos([]), '')
  assert.equal(renderCompactTodos(undefined as never), '')
})

test('renderCompactTodos numbers the items with their status marks', () => {
  const text = renderCompactTodos([
    { content: 'first', status: 'completed' },
    { content: 'second', status: 'in_progress' },
    { content: 'third', status: 'pending' },
  ])
  assert.match(text, /^## Task checklist/m)
  assert.ok(text.includes('1. [x] first'))
  assert.ok(text.includes('2. [~] second'))
  assert.ok(text.includes('3. [ ] third'))
})

test('renderCompactGoal is empty without a goal', () => {
  assert.equal(renderCompactGoal(null), '')
  assert.equal(renderCompactGoal({ goal: '   ' }), '')
})

test('a condition and a plain goal get different headings', () => {
  const cond = renderCompactGoal({ goal: 'all tests green', isCondition: true })
  const note = renderCompactGoal({ goal: 'ship it' })
  assert.match(cond, /Completion goal/)
  assert.match(note, /Session goal/)
  assert.ok(cond.includes('all tests green'))
})

test('buildCompactCarryover marks the block and appends the task', () => {
  const out = buildCompactCarryover(GOOD, 'fix the parser')
  assert.match(
    out,
    /^Context carried over from a previous chat \(compacted\)\./,
  )
  assert.ok(out.includes(GOOD))
  assert.ok(out.includes('Original task: fix the parser'))
})

test('buildCompactCarryover without a task has no task line', () => {
  const out = buildCompactCarryover(GOOD)
  assert.equal(out.includes('Original task:'), false)
})

test('the todos and the goal are appended after the task', () => {
  const out = buildCompactCarryover(
    GOOD,
    'task',
    [{ content: 'one', status: 'pending' }],
    { goal: 'done', isCondition: true },
  )
  const taskAt = out.indexOf('Original task:')
  const todoAt = out.indexOf('## Task checklist')
  const goalAt = out.indexOf('## Completion goal')
  assert.ok(taskAt < todoAt && todoAt < goalAt)
})
