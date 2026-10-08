import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCliArgs, SKIP_VALUE_FLAGS } from '../src/cli-args.ts'

// C3: the CLI parsing is pure and bound to an explicit argv, so it is now
// unit-tested in isolation (index.ts itself is the entry point, not covered).

test('getArg returns the value after a flag, else the fallback', () => {
  const { getArg } = createCliArgs(['--dir', '/proj', '--debug'])
  assert.equal(getArg('--dir'), '/proj')
  assert.equal(getArg('--task', 'none'), 'none')
  assert.equal(getArg('--missing'), null)
})

test('getArg: a flag with no following value yields the fallback', () => {
  const { getArg } = createCliArgs(['--task'])
  assert.equal(getArg('--task', 'fb'), 'fb')
})

test('getArg: a following flag IS taken as the value (historical quirk)', () => {
  // Preserved from the original inline helper, NOT "fixed" during the extract.
  const a = createCliArgs(['--task', '--debug'])
  assert.equal(a.getArg('--task', 'fb'), '--debug')
})

test('hasFlag is a plain membership test', () => {
  const { hasFlag } = createCliArgs(['--headed', '--dev'])
  assert.equal(hasFlag('--headed'), true)
  assert.equal(hasFlag('--headless'), false)
})

test('getPositional collects non-flags and skips value-flag values', () => {
  const { getPositional } = createCliArgs([
    'do',
    'the',
    'thing',
    '--task',
    'ignored',
    '--headed',
    '--dir',
    '/x',
  ])
  assert.deepEqual(getPositional(), ['do', 'the', 'thing'])
})

test('getPositional on an empty argv is empty', () => {
  assert.deepEqual(createCliArgs([]).getPositional(), [])
})

test('SKIP_VALUE_FLAGS lists the value flags the parser expects', () => {
  assert.deepEqual(SKIP_VALUE_FLAGS, [
    '--dir',
    '--task',
    '--max-iter',
    '--chat',
    '--output-format',
  ])
})

test('createCliArgs tolerates a non-array (defensive)', () => {
  const a = createCliArgs(undefined as unknown as string[])
  assert.equal(a.getArg('--x'), null)
  assert.equal(a.hasFlag('--x'), false)
  assert.deepEqual(a.getPositional(), [])
})
