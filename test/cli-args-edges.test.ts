import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCliArgs } from '../src/cli-args.ts'

// test/cli-args.test.ts / cli-args-equals.test.ts pin the basic forms. The
// INTERACTION between them was open: an EMPTY `--task=` must fall through to
// the separate form (not shadow it), a `--flag=value` never becomes a
// positional argument, an unknown flag does not swallow the next token, and a
// value that LOOKS like a flag is taken literally (the documented quirk).

test('an empty --flag= form does not shadow the separate form', () => {
  const c = createCliArgs(['--task=', '--task', 'real task'])
  assert.equal(c.getArg('--task'), 'real task')
})

test('an empty --flag= value falls back instead of returning empty', () => {
  assert.equal(createCliArgs(['--provider=']).getArg('--provider', 'fb'), 'fb')
  assert.equal(createCliArgs(['--provider=']).getArg('--provider'), null)
})

test('a --flag=value pair is not a positional argument', () => {
  const c = createCliArgs(['pos1', '--task=fix it', 'pos2'])
  assert.deepEqual(c.getPositional(), ['pos1', 'pos2'])
})

test('an UNKNOWN flag does not swallow the next positional token', () => {
  // Only SKIP_VALUE_FLAGS consume a value; everything else starting with `--`
  // is simply skipped.
  const c = createCliArgs(['--unknown', 'x', 'pos'])
  assert.deepEqual(c.getPositional(), ['x', 'pos'])
})

test('a value that looks like a flag is taken literally (documented quirk)', () => {
  assert.equal(createCliArgs(['--task', '--x']).getArg('--task'), '--x')
})

test('the FIRST occurrence wins for the separate form', () => {
  const c = createCliArgs(['--dir', 'first', '--dir', 'second'])
  assert.equal(c.getArg('--dir'), 'first')
})

test('a triple-dash flag is matched by its own name only', () => {
  assert.equal(createCliArgs(['---x=v']).getArg('---x'), 'v')
  // `--x` does NOT match `---x=v` (the prefix includes the equals sign).
  assert.equal(createCliArgs(['---x=v']).getArg('--x'), null)
})

test('every SKIP_VALUE_FLAG consumes its value and is never positional', () => {
  for (const flag of [
    '--dir',
    '--task',
    '--max-iter',
    '--chat',
    '--output-format',
    '--provider',
  ]) {
    const c = createCliArgs([flag, 'VALUE', 'pos'])
    assert.deepEqual(c.getPositional(), ['pos'], flag)
    assert.equal(c.getArg(flag), 'VALUE', flag)
  }
})

test('a value-flag at the END of argv does not throw', () => {
  const c = createCliArgs(['pos', '--task'])
  assert.deepEqual(c.getPositional(), ['pos'])
  assert.equal(c.getArg('--task', 'fb'), 'fb')
})
