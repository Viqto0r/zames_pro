import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumeProviderRefusal } from '../src/resume-command.ts'

// The refusal message names the session's OWNER and the ACTIVE provider. The
// owner comes from a session FILE (hand-editable, written by older builds) and
// the active id from the config — neither was flattened before interpolation,
// so a newline in either started a line of its own in the terminal (every
// other report row applies the one-line rule).

const NL = String.fromCharCode(10)

test('a newline in the owner stays on one line', () => {
  const msg = resumeProviderRefusal(
    { provider: ('qwen' + NL + 'FAKE') as never },
    'deepseek',
  )
  assert.ok(msg)
  assert.equal(msg.includes(NL), false, JSON.stringify(msg))
})

test('a newline in the active provider stays on one line', () => {
  const msg = resumeProviderRefusal({ provider: 'qwen' }, 'glm' + NL + 'FAKE')
  assert.ok(msg)
  assert.equal(msg.includes(NL), false, JSON.stringify(msg))
})

test('a matching provider is not refused', () => {
  assert.equal(resumeProviderRefusal({ provider: 'qwen' }, 'qwen'), null)
})
