import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEmptyPollCall } from '../src/agent-loop.ts'

const call = (id: string): string =>
  JSON.stringify({ tool: 'BashOutput', args: { id } })

test('a stale BashOutput poll is recognised', () => {
  assert.equal(isEmptyPollCall(call('b7652f')), true)
  assert.equal(isEmptyPollCall('  ' + call('x')), true)
})

test('a real call or prose is not a stale poll', () => {
  assert.equal(isEmptyPollCall(''), false)
  assert.equal(
    isEmptyPollCall(JSON.stringify({ tool: 'Bash', args: { command: 'ls' } })),
    false,
  )
  assert.equal(
    isEmptyPollCall(JSON.stringify({ tool: 'BashOutput', args: {} })),
    false,
  )
  assert.equal(isEmptyPollCall('Готово.'), false)
  assert.equal(isEmptyPollCall('{"'), false)
})
