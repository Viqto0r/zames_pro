import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTools, MUTATING_TOOLS } from '../src/tools.ts'
import { buildSystemPrompt } from '../src/system-prompt.ts'

// The `AskUser` tool: a modal question to the operator, handled as a SEAM by
// the agent loop (like `Task`), not by the tool's own `fn`. These tests pin the
// contract the loop and the prompt rely on.

test('AskUser is offered in a normal run with its question/options params', () => {
  const tools = createTools(process.cwd())
  const ask = tools.find((t) => t.name === 'AskUser')
  assert.ok(ask, 'AskUser must be in the tool set')
  assert.ok(ask.parameters.question === 'string')
  assert.ok(ask.parameters.options === 'array')
  // The tool description must steer the model AWAY from asking too much.
  assert.match(ask.description, /SPARINGLY/)
  assert.match(ask.description, /recommended/)
})

test('AskUser is NOT offered in plan / read-only mode', () => {
  const tools = createTools(process.cwd(), { readOnly: true })
  assert.equal(
    tools.find((t) => t.name === 'AskUser'),
    undefined,
    'a plan must not be interrupted by a modal question',
  )
})

test('AskUser counts as a non-mutating tool dropped by the read-only filter', () => {
  // filterToolsForReadOnly() drops MUTATING_TOOLS; AskUser must be in that set
  // even though it writes nothing — plan mode means no interruptions either.
  assert.ok(MUTATING_TOOLS.has('AskUser'))
})

test('the AskUser prompt guidance appears only when the tool is offered', () => {
  const withAsk = buildSystemPrompt({
    workdir: '/proj',
    tools: [{ name: 'AskUser', description: 'x', parameters: {}, fn: () => '' }],
  })
  assert.match(withAsk, /## AskUser tool/)
  const without = buildSystemPrompt({ workdir: '/proj', tools: [] })
  assert.doesNotMatch(without, /## AskUser tool/)
})
