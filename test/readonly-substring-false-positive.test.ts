// Read-only (plan) mode drops MCP tools whose name looks like a WRITER. The
// last-resort check is a SUBSTRING match for a concatenated verb
// (`browserclick`), but it also fires on words that merely CONTAIN a verb:
// a genuine READ-ONLY tool named `get_settings`, `get_keywords`,
// `read_insert_log` or `describe_type` was dropped from plan mode — the model
// lost a tool it is allowed to use.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMutatingMcpTool } from '../src/tools.ts'

test('a read-only name containing a verb substring is not a writer', () => {
  for (const name of [
    'pw__get_settings',
    'pw__get_keywords',
    'pw__read_insert_log',
    'pw__describe_type',
  ]) {
    assert.equal(isMutatingMcpTool(name), false, name + ' is read-only')
  }
})

test('real writers are still detected (control)', () => {
  for (const name of [
    'pw__browser_click',
    'pw__browserclick',
    'pw__pageevaluate',
  ]) {
    assert.equal(isMutatingMcpTool(name), true, name + ' writes')
  }
})
