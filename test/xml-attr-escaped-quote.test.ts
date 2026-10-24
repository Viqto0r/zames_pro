// An XML/DSML invoke tag may carry a tool argument as an ATTRIBUTE whose value
// contains an ESCAPED quote (`todos="[{\"content\":\"x\"}]"`). The attribute
// scanner stopped at the first `"`, so the value was cut to `[{\` and the tool
// ran with truncated arguments — TodoWrite lost its checklist, a Write lost
// its content.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseXmlToolCalls } from '../src/xml-toolcall.ts'

test('an escaped quote inside an invoke attribute does not cut the value', () => {
  const call = parseXmlToolCalls(
    '<invoke name="TodoWrite" todos="[{\\"content\\":\\"x\\"}]"></invoke>',
  ) as { tool: string; args: Record<string, unknown> } | null
  assert.ok(call)
  assert.equal(call!.tool, 'TodoWrite')
  assert.equal(call!.args.todos, '[{"content":"x"}]')
})

test('a plain attribute still parses (control)', () => {
  const call = parseXmlToolCalls(
    '<invoke name="Write" path="a.ts" content="x"></invoke>',
  ) as { args: Record<string, unknown> } | null
  assert.equal(call!.args.path, 'a.ts')
  assert.equal(call!.args.content, 'x')
})
