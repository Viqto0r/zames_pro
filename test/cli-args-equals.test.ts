import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCliArgs } from '../src/cli-args.ts'

// The CLI documents `--task <text>` / `--dir <path>` and every value flag has
// an `=` spelling on the command line too (`--task=fix it`, `--dir=/p`). The
// parser only looked for a SEPARATE next argv entry, so the `=` form was
// treated as an unknown flag: its value was DROPPED from the positional task
// and `getArg` returned the fallback — the operator's task silently vanished
// and the agent started with an empty prompt.

test('a --task=value form yields the value', () => {
  const a = createCliArgs(['--task=fix the bug'])
  assert.equal(a.getArg('--task'), 'fix the bug')
  // The value must NOT leak into the positional task text as a bare token.
  assert.deepEqual(a.getPositional(), [])
})

test('a --dir=value form yields the value', () => {
  const a = createCliArgs(['--dir=/tmp/x', 'do', 'it'])
  assert.equal(a.getArg('--dir'), '/tmp/x')
  assert.deepEqual(a.getPositional(), ['do', 'it'])
})

test('the separate form still wins and is unchanged', () => {
  const a = createCliArgs(['--task', 'fix the bug'])
  assert.equal(a.getArg('--task'), 'fix the bug')
  assert.deepEqual(a.getPositional(), [])
})

test('any --flag=value form is parsed, even one the CLI does not use', () => {
  // `getArg` is generic: an unknown `--foo=bar` still yields its value, and the
  // token never leaks into the positional task text.
  const a = createCliArgs(['--foo=bar', 'task'])
  assert.equal(a.getArg('--foo'), 'bar')
  assert.deepEqual(a.getPositional(), ['task'])
})
