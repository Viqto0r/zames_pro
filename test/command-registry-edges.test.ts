import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  matchCommand,
  dispatchCommand,
  type SlashCommand,
} from '../src/command-registry.ts'

// test/command-registry.test.ts pins the routing of the REAL command groups.
// The MATCHER itself had untested edges: surrounding whitespace, a TAB as the
// argument separator (the parser splits on ANY whitespace), a bare slash, a
// command name that is a PREFIX of another (`/s` vs `/status`), a duplicate
// name, and a dev-only command whose handler must never run.

const cmd = (name: string, over: Partial<SlashCommand> = {}): SlashCommand => ({
  name,
  handler: () => {},
  ...over,
})

test('surrounding whitespace is trimmed and the name is case-insensitive', () => {
  const cmds = [cmd('Status', { aliases: ['ST'] })]
  assert.equal(matchCommand(cmds, '   /status   ')?.command.name, 'Status')
  assert.equal(matchCommand(cmds, '/STATUS')?.command.name, 'Status')
  assert.equal(matchCommand(cmds, '/st')?.command.name, 'Status')
})

test('the argument separator may be a TAB and inner spaces are kept', () => {
  const cmds = [cmd('s')]
  assert.equal(matchCommand(cmds, '/s\targ')?.rest, 'arg')
  assert.equal(matchCommand(cmds, '/s  a  b  ')?.rest, 'a  b')
  // No arguments at all.
  assert.equal(matchCommand(cmds, '/s')?.rest, '')
})

test('a bare slash / empty / non-slash line does not match', () => {
  const cmds = [cmd('x')]
  for (const line of ['/', '', '   ', 'x', 'x /y']) {
    assert.equal(matchCommand(cmds, line), null, JSON.stringify(line))
  }
})

test('a name that is a PREFIX of another does not match the longer one', () => {
  const cmds = [cmd('status'), cmd('s')]
  assert.equal(matchCommand(cmds, '/s')?.command.name, 's')
  assert.equal(matchCommand(cmds, '/status')?.command.name, 'status')
  assert.equal(matchCommand(cmds, '/statusx'), null)
})

test('a DUPLICATE name resolves to the FIRST entry', () => {
  const first = cmd('x')
  const second = cmd('x')
  assert.equal(matchCommand([first, second], '/x')?.command, first)
})

test('a dev-only command is rejected BEFORE its handler runs', async () => {
  let ran = 0
  const rejected: string[] = []
  const handled = await dispatchCommand(
    [cmd('secret', { devOnly: true, handler: () => void ran++ })],
    '/secret',
    {
      print: () => {},
      devMode: false,
      onDevOnlyRejected: (n) => rejected.push(n),
    },
  )
  assert.equal(handled, true, 'a rejected line is still HANDLED')
  assert.equal(ran, 0)
  assert.deepEqual(rejected, ['secret'])
  // Without the callback the rejection is silent but still blocks the run.
  const silent = await dispatchCommand(
    [cmd('secret', { devOnly: true, handler: () => void ran++ })],
    '/secret',
    {
      print: () => {},
      devMode: false,
    },
  )
  assert.equal(silent, true)
  assert.equal(ran, 0)
})

test('the handler receives the TRIMMED line and its arguments', async () => {
  const seen: Array<{ input: string; rest: string }> = []
  await dispatchCommand(
    [
      cmd('go', {
        handler: (ctx) => void seen.push({ input: ctx.input, rest: ctx.rest }),
      }),
    ],
    '   /go   one two   ',
    { print: () => {}, devMode: false },
  )
  assert.deepEqual(seen, [{ input: '/go   one two', rest: 'one two' }])
})

test('an unhandled line returns false and runs nothing', async () => {
  let ran = 0
  const ok = await dispatchCommand(
    [cmd('x', { handler: () => void ran++ })],
    '/nope',
    { print: () => {}, devMode: false },
  )
  assert.equal(ok, false)
  assert.equal(ran, 0)
})
