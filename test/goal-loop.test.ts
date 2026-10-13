import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runTask, type RunTaskDeps } from '../src/run-task.ts'
import { translate } from '../src/i18n.ts'
import type { ToolDef } from '../src/types.ts'

// The completion-goal loop (Claude Code parity): a /goal is a CONDITION,
// judged after every turn by a fresh model. These tests drive the loop with a
// fake browser whose ask() returns scripted verdicts.

interface LoopCall {
  task: string
}

function deps(opts: { calls: LoopCall[] }): RunTaskDeps {
  return {
    t: translate('en'),
    locale: 'en',
    debug: false,
    maxIter: 10,
    config: {
      browser: { askDeadlineMs: 240_000, maxAfterToolRetries: 6 },
    } as unknown as RunTaskDeps['config'],
    runAgentLoop: (async (o: Record<string, unknown>) => {
      opts.calls.push({ task: String(o.task) })
      return ''
    }) as unknown as RunTaskDeps['runAgentLoop'],
    createSpinner: (() => ({
      thinking() {},
      sendPause() {},
      setPending() {},
      toolCall() {},
      toolResult() {},
      assistant() {},
      warning() {},
      stop() {},
    })) as unknown as RunTaskDeps['createSpinner'],
    onAssistantMessage: () => {},
  }
}

function makeGoalBrowser(verdicts: string[]) {
  let i = 0
  return {
    _stopped: false,
    _abort: false,
    async stopGeneration() {
      return true
    },
    onSendStart: null as unknown,
    onSendPause: null as unknown,
    onSendState: null as unknown,
    onNotice: null as unknown,
    async ask(prompt: string) {
      assert.ok(prompt.includes('COMPLETION EVALUATOR'), 'evaluator prompt')
      const v = verdicts[i] || 'VERDICT: NOT_MET\nREASON: keep going'
      i++
      return v
    },
  }
}

function baseOpts() {
  return {
    transcript: { log: () => {} } as unknown as never,
    freshChat: true,
    sendSystemPrompt: true,
  }
}

const tools: ToolDef[] = []

test('goal: NOT_MET starts another turn, MET clears the goal', async () => {
  const calls: LoopCall[] = []
  const browser = makeGoalBrowser([
    'VERDICT: NOT_MET\nREASON: tests not yet run',
    'VERDICT: MET\nREASON: all tests pass',
  ])
  const cleared: string[] = []
  const res = await runTask(
    deps({ calls }),
    browser as never,
    tools,
    'initial task',
    process.cwd(),
    {
      ...baseOpts(),
      goal: 'all tests pass',
      goalIsCondition: true,
      goalQuery: () => 'all tests pass',
      onGoalCleared: async (v) => {
        cleared.push(v.status)
      },
    },
  )
  assert.equal(res.ok, true)
  assert.equal(calls.length, 2)
  assert.ok(calls[0].task.includes('initial task'))
  assert.ok(calls[0].task.includes('all tests pass'))
  assert.ok(calls[1].task.includes('NOT yet met'))
  assert.ok(calls[1].task.includes('tests not yet run'))
  assert.deepEqual(cleared, ['met'])
})

test('goal: IMPOSSIBLE clears the goal and stops', async () => {
  const calls: LoopCall[] = []
  const browser = makeGoalBrowser(['VERDICT: IMPOSSIBLE\nREASON: no such file'])
  const cleared: string[] = []
  await runTask(deps({ calls }), browser as never, tools, 't', process.cwd(), {
    ...baseOpts(),
    goal: 'impossible thing',
    goalIsCondition: true,
    goalQuery: () => 'impossible thing',
    onGoalCleared: async (v) => {
      cleared.push(v.status)
    },
  })
  assert.equal(calls.length, 1)
  assert.deepEqual(cleared, ['impossible'])
})

test('goal: a cleared goal (goalQuery -> null) stops auto-continue', async () => {
  const calls: LoopCall[] = []
  const browser = makeGoalBrowser(['VERDICT: NOT_MET\nREASON: x'])
  await runTask(deps({ calls }), browser as never, tools, 't', process.cwd(), {
    ...baseOpts(),
    goal: 'cond',
    goalIsCondition: true,
    goalQuery: () => null,
  })
  assert.equal(calls.length, 1)
})

test('goal: without goalIsCondition the loop does not evaluate', async () => {
  const calls: LoopCall[] = []
  const browser = makeGoalBrowser(['VERDICT: NOT_MET\nREASON: x'])
  await runTask(deps({ calls }), browser as never, tools, 't', process.cwd(), {
    ...baseOpts(),
    goal: 'just a note',
  })
  assert.equal(calls.length, 1)
})
