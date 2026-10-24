// renderCost() prints a per-tool breakdown whose NAME comes from the model (or
// an MCP server) and is arbitrary text. It is printed VERBATIM, so a newline
// in the name starts a new terminal line and can spoof the report (an `[OK]`
// doctor row, a fake heading). The report is operator-facing text: a name must
// stay on its own line.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderCost, summarizeTranscript } from '../src/commands.ts'
import { translate } from '../src/i18n.ts'

test('a tool name cannot break the /cost report into extra lines', () => {
  const stats = summarizeTranscript([
    { type: 'tool_call', tool: 'x\n[OK]  auth   saved' },
    { type: 'tool_result', tool: 'x\n[OK]  auth   saved', durationMs: 5 },
  ] as never)
  const out = renderCost(stats, null, null, translate('en'))
  for (const line of out.split('\n')) {
    assert.equal(
      line.startsWith('[OK]'),
      false,
      'injected line in /cost: ' + JSON.stringify(out),
    )
  }
})

test('a normal tool name is still shown', () => {
  const stats = summarizeTranscript([
    { type: 'tool_call', tool: 'Bash' },
  ] as never)
  const out = renderCost(stats, null, null, translate('en'))
  assert.ok(out.includes(' Bash: 1'), out)
})
