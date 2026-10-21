import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTools, mergeTools, isMutatingMcpTool } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'

// Read-only (plan) mode must DROP every MCP tool that can change state. The
// verb matcher required `_verb_`, so a server whose names CONCATENATE the verb
// (browserclick / pageevaluate / formfill - a real style, e.g. a lowercased
// camelCase name) kept its writers in plan mode: the promise "no side effects"
// was broken by a single click.
const names = [
  'pw__browserclick',
  'pw__browserClick',
  'pw__browsertype',
  'pw__pageevaluate',
  'pw__formfill',
  'pw__fileupload',
  'pw__keypress',
  'pw__mouseclick',
  'pw__codeexecute',
]

for (const name of names) {
  test(`a concatenated mutating verb is detected: ${name}`, () => {
    assert.equal(isMutatingMcpTool(name), true)
  })
}

test('a read-only keeper stays: browser_snapshot / get_page', () => {
  assert.equal(isMutatingMcpTool('pw__browser_snapshot'), false)
  assert.equal(isMutatingMcpTool('pw__get_page'), false)
  assert.equal(isMutatingMcpTool('pw__read_file'), false)
})

const tool = (name: string): ToolDef => ({
  name,
  description: '',
  parameters: {},
  fn: () => '',
})

test('mergeTools(readOnly) drops a concatenated-verb writer', () => {
  const merged = mergeTools(
    createTools(process.cwd(), {}),
    [tool('pw__browserclick'), tool('pw__browser_snapshot')],
    true,
  )
  const names2 = merged.map((t) => t.name)
  assert.ok(!names2.includes('pw__browserclick'), 'a click must be dropped')
  assert.ok(names2.includes('pw__browser_snapshot'), 'a snapshot stays')
})
