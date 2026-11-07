import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createSchedulerCommands,
  goalDirective,
  GOAL_TASK_OVERRIDE,
  type SchedulerCommandDeps,
} from '../src/scheduler-commands.ts'
import { dispatchCommand } from '../src/command-registry.ts'

// N2 group (d): /compact, /goal, /loop, /cron, /jobs. The state is INJECTED,
// so the routing and the goal directive seam are what these tests pin.

function makeDeps(goalResult: 'set' | 'handled' = 'handled'): {
  deps: SchedulerCommandDeps
  calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    deps: {
      compact: async () => void calls.push('compact'),
      goal: async (line) => {
        calls.push('goal:' + line)
        return goalResult
      },
      currentGoal: () => 'ship it',
      loop: (rest) => void calls.push('loop:' + rest),
      cron: (rest) => void calls.push('cron:' + rest),
      jobs: (rest) => void calls.push('jobs:' + rest),
    },
  }
}

async function run(deps: SchedulerCommandDeps, line: string): Promise<void> {
  const ok = await dispatchCommand(createSchedulerCommands(deps), line, {
    print: () => {},
    devMode: false,
  })
  assert.equal(ok, true, 'not handled: ' + line)
}

test('the group exposes exactly the five scheduler commands', () => {
  const names = createSchedulerCommands(makeDeps().deps).map((c) => c.name)
  assert.deepEqual(names, ['compact', 'goal', 'loop', 'cron', 'jobs'])
})

test('every command forwards its argument text to the injected handler', async () => {
  const { deps, calls } = makeDeps()
  await run(deps, '/compact')
  await run(deps, '/loop 5m run the tests')
  await run(deps, '/cron "*/5 * * * *" nightly')
  await run(deps, '/jobs rm 2')
  assert.deepEqual(calls, [
    'compact',
    'loop:5m run the tests',
    'cron:"*/5 * * * *" nightly',
    'jobs:rm 2',
  ])
})

test('an argument-less command passes an empty rest', async () => {
  const { deps, calls } = makeDeps()
  await run(deps, '/loop')
  await run(deps, '/jobs')
  assert.deepEqual(calls, ['loop:', 'jobs:'])
})

test('/goal receives the WHOLE typed line, not just the condition', async () => {
  const { deps, calls } = makeDeps()
  await run(deps, '/goal all tests green')
  assert.deepEqual(calls, ['goal:/goal all tests green'])
})

test('goalDirective returns the override only for a freshly SET goal', () => {
  const deps = { currentGoal: () => 'ship it' }
  assert.equal(goalDirective(deps, true), GOAL_TASK_OVERRIDE)
  assert.equal(goalDirective(deps, false), null)
})

test('goalDirective is null when no condition is stored', () => {
  assert.equal(goalDirective({ currentGoal: () => null }, true), null)
  assert.equal(goalDirective({ currentGoal: () => '' }, true), null)
})

test('the override tells the model not to finish before the goal is met', () => {
  assert.match(GOAL_TASK_OVERRIDE, /completion goal/)
  assert.match(GOAL_TASK_OVERRIDE, /Do not call respond/)
})
