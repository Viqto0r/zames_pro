import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderDoctor } from '../src/commands.ts'

// `/doctor` is the OPERATOR's health screen: every row must read as a fact.
// The prompt row is guarded by `typeof === 'number'`, and NaN is a number, so
// an unmeasurable prompt printed `prompt  NaN KB (budget 23.4 KB)` — a number
// that cannot be acted on, and `overBudget(NaN, budget)` is false, so the row
// was even shown as [OK]. A health check must not report OK for a value it
// could not measure.

const base = {
  nodeVersion: 'v24.0.0',
  platform: 'linux',
  workdir: '/tmp',
  gitOk: false,
  configOk: true,
  authSaved: false,
  clipboardTool: '',
  mcpServers: 0,
  mcpTools: 0,
  transcriptOk: true,
}

test('an unmeasurable system prompt is not reported as OK with NaN', () => {
  const out = renderDoctor({ ...base, systemPromptBytes: Number.NaN } as never)
  const row = out
    .split(String.fromCharCode(10))
    .find((l) => l.includes('prompt'))
  if (row) {
    assert.ok(!/NaN/.test(row), 'NaN leaked into the doctor row: ' + row)
    assert.match(
      row,
      /\[WARN\]/,
      'an unmeasured prompt must not be [OK]: ' + row,
    )
  }
})

test('a measured prompt keeps its OK row and budget', () => {
  const out = renderDoctor({ ...base, systemPromptBytes: 20000 } as never)
  const row = out
    .split(String.fromCharCode(10))
    .find((l) => l.includes('prompt'))
  assert.ok(row, 'the prompt row is missing')
  assert.match(row as string, /\[OK\]/)
  assert.match(row as string, /19\.5 KB/)
})
