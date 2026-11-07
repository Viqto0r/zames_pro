import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDevCommands, type DevCommandDeps } from '../src/dev-commands.ts'
import { DEV_ONLY_COMMANDS, isDevOnlyCommand } from '../src/commands.ts'
import { LOOP_CYCLES } from '../src/loop-prompts.ts'
import { dispatchCommand } from '../src/command-registry.ts'

// N2 group (e): the dev-only commands. Two invariants the operator relies on:
// the registry list and DEV_ONLY_COMMANDS name the SAME set (a command that
// dispatches but is not in the guard reaches a regular user, and vice versa),
// and every entry is flagged `devOnly` so the shared dispatch rejects it.

function makeDeps(): { deps: DevCommandDeps; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    deps: {
      improve: async (arg) => void calls.push('improve:' + arg),
      backlog: async (note) => void calls.push('backlog:' + note),
      selfReview: async (focus) => void calls.push('selfReview:' + focus),
      selfFix: async (rest) => void calls.push('selfFix:' + rest),
      selfDone: async () => void calls.push('selfDone'),
      selfList: async () => void calls.push('selfList'),
      selfDiff: async (name) => void calls.push('selfDiff:' + name),
      selfApply: async (name) => void calls.push('selfApply:' + name),
      cycle: (id, rest) =>
        void calls.push('cycle:' + id + (rest ? ':' + rest : '')),
    },
  }
}

test('every dev command is flagged devOnly', () => {
  const commands = createDevCommands(makeDeps().deps)
  assert.ok(commands.length > 0)
  for (const c of commands) {
    assert.equal(c.devOnly, true, c.name + ' must be devOnly')
  }
})

test('the registry names and DEV_ONLY_COMMANDS are the same set', () => {
  const names = createDevCommands(makeDeps().deps)
    .map((c) => '/' + c.name)
    .sort()
  assert.deepEqual(names, [...DEV_ONLY_COMMANDS].sort())
})

test('every command name is a dev-only command for the guard', () => {
  for (const c of createDevCommands(makeDeps().deps)) {
    assert.equal(isDevOnlyCommand('/' + c.name), '/' + c.name)
    assert.equal(
      isDevOnlyCommand('/' + c.name + ' some argument'),
      '/' + c.name,
    )
  }
})

test('the cycle ids are the loop cycles except backlog, which is a note command', () => {
  const names = createDevCommands(makeDeps().deps).map((c) => c.name)
  for (const id of LOOP_CYCLES) {
    if (id === 'backlog') {
      assert.ok(names.includes('backlog'), 'backlog stays a command')
    } else {
      assert.ok(names.includes(id), id + ' is a cycle command')
    }
  }
  assert.equal(names.filter((n) => n === 'backlog').length, 1)
})

test('a cycle handler receives its id and the typed rest', async () => {
  const { deps, calls } = makeDeps()
  const commands = createDevCommands(deps)
  const ok = await dispatchCommand(commands, '/coverage 10m', {
    print: () => {},
    devMode: true,
  })
  assert.equal(ok, true)
  assert.deepEqual(calls, ['cycle:coverage:10m'])
})

test('a plain dev command receives its argument text', async () => {
  const { deps, calls } = makeDeps()
  const commands = createDevCommands(deps)
  await dispatchCommand(commands, '/improve the parser', {
    print: () => {},
    devMode: true,
  })
  await dispatchCommand(commands, '/self-done', {
    print: () => {},
    devMode: true,
  })
  assert.deepEqual(calls, ['improve:the parser', 'selfDone'])
})

test('a regular user is rejected by the shared dispatch, not run', async () => {
  const { deps, calls } = makeDeps()
  const commands = createDevCommands(deps)
  const rejected: string[] = []
  const ok = await dispatchCommand(commands, '/self-review src', {
    print: () => {},
    devMode: false,
    onDevOnlyRejected: (name) => rejected.push(name),
  })
  assert.equal(ok, true)
  assert.deepEqual(rejected, ['self-review'])
  assert.deepEqual(calls, [])
})
