import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDevCommands } from '../src/dev-commands.ts'
import {
  buildCycleLoopLine,
  isLoopCycle,
  LOOP_CYCLES,
  DEFAULT_LOOP_INTERVAL,
} from '../src/loop-prompts.ts'
import { DEV_ONLY_COMMANDS } from '../src/commands.ts'

const NL = String.fromCharCode(10)

// `createDevCommands` wires every dev-only command to its OWN handler, and
// `buildCycleLoopLine` turns a cycle into the ONE `/loop` line. A silent
// regression dispatches the wrong handler (an argument lands in the wrong
// slot), lets a regular user reach a cycle, or arms a loop with a broken
// interval.

interface Recorded {
  calls: Array<[string, ...unknown[]]>
}

function deps(): Recorded & Record<string, unknown> {
  const calls: Array<[string, ...unknown[]]> = []
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args])
      return Promise.resolve()
    }
  return {
    calls,
    improve: rec('improve'),
    backlog: rec('backlog'),
    selfReview: rec('selfReview'),
    selfFix: rec('selfFix'),
    selfDone: rec('selfDone'),
    selfList: rec('selfList'),
    selfDiff: rec('selfDiff'),
    selfApply: rec('selfApply'),
    cycle: rec('cycle'),
  }
}

const handler = (name: string) => {
  const cmds = createDevCommands(deps() as never)
  const c = cmds.find((x) => x.name === name)
  assert.ok(c, 'no command ' + name)
  return c
}

test('the registry holds exactly the dev-only commands', () => {
  const cmds = createDevCommands(deps() as never)
  assert.deepEqual(
    cmds.map((c) => c.name).sort(),
    [
      'backlog',
      'bughunt',
      'coverage',
      'dumps',
      'improve',
      'self-apply',
      'self-diff',
      'self-done',
      'self-fix',
      'self-list',
      'self-review',
      'smoke',
      'textaudit',
    ].sort(),
  )
  // `backlog` is the COMMAND (a note); the cycle of the same name is not a
  // second registry entry, so no name appears twice.
  assert.equal(cmds.filter((c) => c.name === 'backlog').length, 1)
  // Every entry is dev-only, which is the guard the dispatcher reads.
  assert.ok(cmds.every((c) => c.devOnly === true))
})

test('each command passes its own rest to its own handler', async () => {
  const d = deps()
  const cmds = createDevCommands(d as never)
  const call = async (name: string, rest: string) => {
    d.calls.length = 0
    const c = cmds.find((x) => x.name === name)
    assert.ok(c, name)
    await c.handler({ rest } as never)
    return d.calls[0]
  }
  assert.deepEqual(await call('improve', 'the focus'), ['improve', 'the focus'])
  assert.deepEqual(await call('backlog', 'a note'), ['backlog', 'a note'])
  assert.deepEqual(await call('self-review', 'sec'), ['selfReview', 'sec'])
  assert.deepEqual(await call('self-fix', 'snap1'), ['selfFix', 'snap1'])
  assert.deepEqual(await call('self-diff', 'snap2'), ['selfDiff', 'snap2'])
  assert.deepEqual(await call('self-apply', 'snap3'), ['selfApply', 'snap3'])
  assert.deepEqual(await call('self-done', ''), ['selfDone'])
  assert.deepEqual(await call('self-list', ''), ['selfList'])
  // A cycle passes its OWN id plus the interval text.
  assert.deepEqual(await call('coverage', '10m'), ['cycle', 'coverage', '10m'])
  assert.deepEqual(await call('smoke', ''), ['cycle', 'smoke', ''])
})

test('an unknown cycle id is neither a cycle nor a command', () => {
  assert.equal(isLoopCycle('nope'), false)
  assert.equal(isLoopCycle(undefined as never), false)
  assert.equal(isLoopCycle('BUghunt'), true)
  assert.equal(buildCycleLoopLine('nope'), null)
  const cmds = createDevCommands(deps() as never)
  assert.equal(
    cmds.some((c) => c.name === 'nope'),
    false,
  )
  // The command list is EXACTLY the cycle list minus `backlog` plus the rest.
  const cycleNames = LOOP_CYCLES.filter((id) => id !== 'backlog')
  for (const id of cycleNames) {
    assert.ok(
      cmds.some((c) => c.name === id),
      id,
    )
    assert.ok(DEV_ONLY_COMMANDS.includes('/' + id), id)
  }
})

test('every cycle body is substantive and names its own step', () => {
  const markers: Record<string, RegExp> = {
    bughunt: /RED/,
    textaudit: /build:readme/,
    coverage: /coverage:gate/,
    dumps: /unparsed/,
    backlog: /BACKLOG\.md/,
    smoke: /isolated|throwaway HOME/i,
  }
  for (const id of LOOP_CYCLES) {
    const line = String(buildCycleLoopLine(id))
    assert.ok(line.length > 300, id + ' body is too short')
    assert.match(line, markers[id], id + ' lost its step phrase')
    // The shared tail is the SAME in every cycle: gates, push, release policy
    // and the stop condition.
    assert.match(
      line,
      /run the gates \(typecheck, test, lint, format:check, build\)/,
    )
    assert.match(line, /git push origin master/)
    assert.match(line, /decideRelease\(\)/)
    assert.match(line, /\/jobs clear/)
    // A body never contains a raw newline: the scheduler parses ONE line.
    assert.ok(!line.includes(NL), id + ' body has a newline')
  }
})

test('the interval is the FIRST token and is whitespace-free', () => {
  const line = String(buildCycleLoopLine('coverage', ' 5 m '))
  assert.equal(line.split(' ')[0], '/loop')
  assert.equal(line.split(' ')[1], '5m')
  const tab = String(buildCycleLoopLine('coverage', '10\tm'))
  assert.equal(tab.split(' ')[1], '10m')
})

test('an empty interval falls back to the default period', () => {
  for (const bad of ['', '   ', undefined, null]) {
    const line = String(buildCycleLoopLine('smoke', bad as never))
    assert.ok(
      line.startsWith('/loop ' + DEFAULT_LOOP_INTERVAL + ' '),
      String(bad),
    )
  }
  assert.equal(DEFAULT_LOOP_INTERVAL, '5m')
})
