import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTools } from '../src/tools.ts'
import { buildSystemPrompt } from '../src/system-prompt.ts'

// G3 guard: the system prompt must DERIVE its tool list from the ToolDefs
// (createTools) instead of carrying a second, hand-maintained copy. The old
// risk was drift — the prompt promising a tool that no longer exists, or
// missing one that was added. This test fails the moment either happens.

test('every createTools() tool appears as a ### heading with its description', () => {
  const tools = createTools(process.cwd())
  const sp = buildSystemPrompt({ workdir: process.cwd(), tools })

  assert.ok(tools.length >= 10, 'createTools returned a suspiciously small set')
  for (const tool of tools) {
    assert.ok(
      sp.includes('### ' + tool.name),
      `the prompt has no "### ${tool.name}" heading`,
    )
    assert.ok(
      sp.includes(tool.description),
      `the prompt does not carry the description of ${tool.name}`,
    )
    assert.ok(
      sp.includes('Parameters: ' + JSON.stringify(tool.parameters)),
      `the prompt does not carry the parameters of ${tool.name}`,
    )
  }
})

test('the prompt has exactly one heading per tool (no hand-written duplicate)', () => {
  const tools = createTools(process.cwd())
  const sp = buildSystemPrompt({ workdir: process.cwd(), tools })
  const headings = sp.match(/\n### /g) || []
  assert.equal(headings.length, tools.length)
})

// The subagent guidance is CONDITIONAL: it must be in the prompt only when the
// `Task` tool is actually offered, otherwise the prompt tells the model about
// a tool it does not have (subagents off, or plan/read-only mode).
test('subagent guidance appears only when the Task tool is offered', () => {
  const withTask = buildSystemPrompt({
    workdir: process.cwd(),
    tools: createTools(process.cwd(), { subagents: true }),
  })
  assert.ok(
    withTask.includes('## Task tool (subagents)'),
    'Task guidance is missing even though Task is offered',
  )
  assert.ok(
    withTask.includes('must be fully self-contained'),
    'Task guidance lacks the self-contained-prompt warning',
  )

  const withoutTask = buildSystemPrompt({
    workdir: process.cwd(),
    tools: createTools(process.cwd(), { subagents: false }),
  })
  assert.ok(
    !withoutTask.includes('## Task tool (subagents)'),
    'Task guidance leaked into the prompt when Task is not offered',
  )
})
