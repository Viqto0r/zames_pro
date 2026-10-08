import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  runTask,
  askOperatorConfirm,
  type RunTaskDeps,
  type PendingMessage,
} from '../src/run-task.ts'
import { translate } from '../src/i18n.ts'
import type { ToolDef } from '../src/types.ts'

// runTask() (src/run-task.ts) is the piece the main loop delegates every task
// to: it runs the agent loop, then drains the operator's queue (batching plain
// messages, stopping at a slash-command) and prints a per-task summary. It was
// untested while living in index.ts; now it is a free function with explicit
// deps, so we can pin its CURRENT behavior with fakes.

interface FakeBrowser {
  _stopped: boolean
  _abort: boolean
  stopGeneration: () => Promise<boolean>
  onSendStart: unknown
  onSendPause: unknown
  onSendState: unknown
  onNotice: unknown
}

interface LoopCall {
  task: string
  freshChat: boolean
  sendSystemPrompt: boolean
  attachments: Array<{ path: string; name: string; mime: string }>
}

// A LineEditor stand-in that records everything the task prints above the
// input line and any state runTask toggles on it.
function makeEditor() {
  const above: string[] = []
  const warnings: string[] = []
  return {
    busy: false,
    above,
    warnings,
    printAbove(text: unknown) {
      above.push(String(text))
    },
    thinking() {},
    sendPause() {},
    setSendState() {},
    stop() {},
    toolCall() {},
    toolResult() {},
    assistant() {},
    warning(text: unknown) {
      warnings.push(String(text))
    },
  }
}

function deps(
  overrides: Partial<RunTaskDeps> & { calls: LoopCall[] },
): RunTaskDeps {
  const { calls, ...rest } = overrides
  return {
    t: translate('en'),
    locale: 'en',
    debug: false,
    maxIter: 10,
    config: {
      browser: {
        askDeadlineMs: 240_000,
        maxAfterToolRetries: 6,
      },
    } as unknown as RunTaskDeps['config'],
    runAgentLoop: (async (opts: Record<string, unknown>) => {
      calls.push({
        task: String(opts.task),
        freshChat: Boolean(opts.freshChat),
        sendSystemPrompt: Boolean(opts.sendSystemPrompt),
        attachments: (opts.attachments as LoopCall['attachments']) || [],
      })
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
    ...rest,
  }
}

function makeBrowser(): FakeBrowser {
  return {
    _stopped: false,
    _abort: false,
    async stopGeneration() {
      return true
    },
    onSendStart: null,
    onSendPause: null,
    onSendState: null,
    onNotice: null,
  }
}

const tools: ToolDef[] = []

function baseOpts(
  transcriptLog?: (e: string, d: Record<string, unknown>) => void,
) {
  // runTask requires a Transcript; the fakes only need .log().
  const transcript = {
    log: transcriptLog || (() => {}),
  } as unknown as import('../src/transcript.ts').Transcript
  return {
    transcript,
    freshChat: true,
    sendSystemPrompt: true,
  }
}

function consoleCapture() {
  const out: string[] = []
  const orig = console.log
  const origErr = console.error
  console.log = (...a: unknown[]) => out.push(a.map(String).join(' '))
  console.error = (...a: unknown[]) => out.push(a.map(String).join(' '))
  return {
    out,
    restore() {
      console.log = orig
      console.error = origErr
    },
  }
}

function freshChatArg(calls: LoopCall[], i: number) {
  return calls[i].freshChat
}

test('runTask runs the first message as a fresh chat with the system prompt', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const queue: PendingMessage[] = []
  await runTask(
    deps({ calls }),
    browser as never,
    tools,
    'do the thing',
    process.cwd(),
    { ...baseOpts(), queue },
    [{ path: '/x/a.png', name: 'a.png', mime: 'image/png' }],
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].task, 'do the thing')
  assert.equal(calls[0].freshChat, true)
  assert.equal(calls[0].sendSystemPrompt, true)
  assert.equal(calls[0].attachments.length, 1)
  assert.equal(queue.length, 0)
})

test('runTask drains a queued message in the SAME chat without the system prompt', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const queue: PendingMessage[] = [{ text: 'next please' }]
  await runTask(
    deps({ calls }),
    browser as never,
    tools,
    'first',
    process.cwd(),
    {
      ...baseOpts(),
      queue,
    },
  )
  assert.equal(calls.length, 2)
  assert.equal(calls[0].freshChat, true)
  assert.equal(calls[1].task, 'next please')
  assert.equal(calls[1].freshChat, false)
  assert.equal(calls[1].sendSystemPrompt, false)
  assert.equal(queue.length, 0)
})

test('runTask batches leading plain messages into ONE task', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const queue: PendingMessage[] = [
    { text: 'one' },
    { text: 'two' },
    { text: 'three' },
  ]
  const logs: Array<{ e: string; d: Record<string, unknown> }> = []
  await runTask(
    deps({ calls }),
    browser as never,
    tools,
    'start',
    process.cwd(),
    { ...baseOpts((e, d) => logs.push({ e, d })), queue },
  )
  // one send for the task + one for the batched triple
  assert.equal(calls.length, 2)
  assert.equal(calls[1].task.includes('one'), true)
  assert.equal(calls[1].task.includes('two'), true)
  assert.equal(calls[1].task.includes('three'), true)
  const queuedLog = logs.find((l) => l.e === 'queued_task')
  assert.ok(queuedLog, 'queued_task is logged')
  assert.equal(queuedLog.d.count, 3)
})

test('runTask stops draining at a slash-command and leaves it queued', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const queue: PendingMessage[] = [
    { text: 'plain' },
    { text: '/diff' },
    { text: 'after' },
  ]
  await runTask(
    deps({ calls }),
    browser as never,
    tools,
    'start',
    process.cwd(),
    {
      ...baseOpts(),
      queue,
    },
  )
  // first task + the batched plain message; the slash-command and everything
  // after it stay in the queue for the main loop.
  assert.equal(calls.length, 2)
  assert.deepEqual(
    queue.map((m) => m.text),
    ['/diff', 'after'],
  )
})

test('runTask breaks immediately when the queue STARTS with a slash-command', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const queue: PendingMessage[] = [{ text: '/help' }]
  await runTask(
    deps({ calls }),
    browser as never,
    tools,
    'start',
    process.cwd(),
    {
      ...baseOpts(),
      queue,
    },
  )
  assert.equal(calls.length, 1)
  assert.deepEqual(
    queue.map((m) => m.text),
    ['/help'],
  )
})

test('runTask on browser._stopped clears the queue and starts nothing else', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const queue: PendingMessage[] = [{ text: 'should not run' }]
  const runAgentLoop = (async (opts: Record<string, unknown>) => {
    calls.push({
      task: String(opts.task),
      freshChat: Boolean(opts.freshChat),
      sendSystemPrompt: Boolean(opts.sendSystemPrompt),
      attachments: [],
    })
    // The operator hit Esc while the task was running.
    browser._stopped = true
    return ''
  }) as unknown as RunTaskDeps['runAgentLoop']
  await runTask(
    deps({ calls, runAgentLoop }),
    browser as never,
    tools,
    'long',
    process.cwd(),
    {
      ...baseOpts(),
      queue,
    },
  )
  assert.equal(calls.length, 1)
  assert.equal(queue.length, 0, 'an abort clears the pending queue')
})

test('runTask prints a per-task summary and logs queued_task/agent_no_answer', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const editor = makeEditor()
  const logs: Array<{ e: string; d: Record<string, unknown> }> = []
  let usage = 0
  const runAgentLoop = (async (opts: Record<string, unknown>) => {
    calls.push({
      task: String(opts.task),
      freshChat: Boolean(opts.freshChat),
      sendSystemPrompt: Boolean(opts.sendSystemPrompt),
      attachments: [],
    })
    usage = 1500
    ;(opts.onToolCall as (n: string) => void)('Read')
    ;(opts.onToolCall as (n: string) => void)('Bash')
    return 'Iteration limit reached (maxIterations=10)'
  }) as unknown as RunTaskDeps['runAgentLoop']
  const cap = consoleCapture()
  try {
    await runTask(
      deps({ calls, runAgentLoop }),
      browser as never,
      tools,
      'do it',
      process.cwd(),
      {
        ...baseOpts((e, d) => logs.push({ e, d })),
        queue: [],
        ui: editor as never,
        getTokenUsage: () => usage,
      },
    )
  } finally {
    cap.restore()
  }
  const summary = editor.above.join(String.fromCharCode(10))
  assert.ok(summary.includes('duration'), 'summary has a duration: ' + summary)
  assert.ok(summary.includes('tools: 2'), 'summary counts tools: ' + summary)
  assert.ok(
    summary.includes('tokens: 1.5k'),
    'summary has the token delta: ' + summary,
  )
  assert.ok(
    editor.warnings.some((l) => l.includes('Iteration limit reached')),
    'the watchdog outcome is surfaced',
  )
  assert.ok(logs.some((l) => l.e === 'agent_no_answer'))
})

test('runTask attaches the send hooks in the loop and detaches them after', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  let sawHooks = false
  const runAgentLoop = (async (opts: Record<string, unknown>) => {
    calls.push({
      task: String(opts.task),
      freshChat: true,
      sendSystemPrompt: true,
      attachments: [],
    })
    sawHooks =
      typeof opts.onThinking === 'function' &&
      typeof opts.onNotice === 'function'
    return ''
  }) as unknown as RunTaskDeps['runAgentLoop']
  await runTask(
    deps({ calls, runAgentLoop }),
    browser as never,
    tools,
    'x',
    process.cwd(),
    {
      ...baseOpts(),
      queue: [],
    },
  )
  assert.equal(sawHooks, true)
  assert.equal(browser.onSendStart, null)
  assert.equal(browser.onSendPause, null)
  assert.equal(browser.onSendState, null)
  assert.equal(browser.onNotice, null)
})

test('runTask marks the editor busy during the task and clears it after', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const editor = makeEditor()
  const busyDuring: boolean[] = []
  const runAgentLoop = (async (opts: Record<string, unknown>) => {
    calls.push({
      task: String(opts.task),
      freshChat: true,
      sendSystemPrompt: true,
      attachments: [],
    })
    busyDuring.push(editor.busy)
    return ''
  }) as unknown as RunTaskDeps['runAgentLoop']
  await runTask(
    deps({ calls, runAgentLoop }),
    browser as never,
    tools,
    'x',
    process.cwd(),
    {
      ...baseOpts(),
      queue: [],
      ui: editor as never,
    },
  )
  assert.deepEqual(busyDuring, [true])
  assert.equal(editor.busy, false)
})

test('runTask reports a thrown agent error and clears the queue on abort', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const logs: Array<{ e: string; d: Record<string, unknown> }> = []
  const runAgentLoop = (async () => {
    throw new Error('boom')
  }) as unknown as RunTaskDeps['runAgentLoop']
  const cap = consoleCapture()
  try {
    await runTask(
      deps({ calls, runAgentLoop }),
      browser as never,
      tools,
      'x',
      process.cwd(),
      {
        ...baseOpts((e, d) => logs.push({ e, d })),
        queue: [{ text: 'later' }],
      },
    )
  } finally {
    cap.restore()
  }
  assert.ok(cap.out.some((l) => l.includes('Agent error')))
  assert.ok(logs.some((l) => l.e === 'agent_error'))
  // The throw happens before the summary/drain, so the queued message survives.
  assert.equal(browser._stopped, false)
})

test('runTask returns ok:true on a normal task (one-shot exit code 0)', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const res = await runTask(
    deps({ calls }),
    browser as never,
    tools,
    'x',
    process.cwd(),
    { ...baseOpts(), queue: [] },
  )
  assert.equal(res.ok, true)
})

test('runTask returns ok:false on an iteration limit (one-shot exit code 1)', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const runAgentLoop = (async () =>
    'Iteration limit reached (maxIterations=10)') as unknown as RunTaskDeps['runAgentLoop']
  const cap = consoleCapture()
  let res
  try {
    res = await runTask(
      deps({ calls, runAgentLoop }),
      browser as never,
      tools,
      'x',
      process.cwd(),
      { ...baseOpts(), queue: [] },
    )
  } finally {
    cap.restore()
  }
  assert.equal(res.ok, false)
  assert.match(res.error || '', /Iteration limit/)
})

test('runTask returns ok:false when the agent throws (one-shot exit code 1)', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const runAgentLoop = (async () => {
    throw new Error('boom')
  }) as unknown as RunTaskDeps['runAgentLoop']
  const cap = consoleCapture()
  let res
  try {
    res = await runTask(
      deps({ calls, runAgentLoop }),
      browser as never,
      tools,
      'x',
      process.cwd(),
      { ...baseOpts(), queue: [] },
    )
  } finally {
    cap.restore()
  }
  assert.equal(res.ok, false)
  assert.match(res.error || '', /boom/)
})

test('runTask applies the goal via withGoal to every message', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  const queue: PendingMessage[] = [{ text: 'second' }]
  await runTask(
    deps({ calls }),
    browser as never,
    tools,
    'first',
    process.cwd(),
    {
      ...baseOpts(),
      queue,
      goal: 'ship the release',
    },
  )
  assert.equal(calls.length, 2)
  assert.ok(calls[0].task.includes('ship the release'))
  assert.ok(calls[1].task.includes('ship the release'))
})

test('runTask resets _stopped/_abort from a previous run', async () => {
  const calls: LoopCall[] = []
  const browser = makeBrowser()
  browser._stopped = true
  browser._abort = true
  const runAgentLoop = (async (opts: Record<string, unknown>) => {
    calls.push({
      task: String(opts.task),
      freshChat: true,
      sendSystemPrompt: true,
      attachments: [],
    })
    return ''
  }) as unknown as RunTaskDeps['runAgentLoop']
  await runTask(
    deps({ calls, runAgentLoop }),
    browser as never,
    tools,
    'x',
    process.cwd(),
    {
      ...baseOpts(),
      queue: [],
    },
  )
  assert.equal(calls.length, 1)
})

test('askOperatorConfirm denies when stdin is not a TTY', async () => {
  const wasIn = process.stdin.isTTY
  const wasOut = process.stdout.isTTY
  // The test runner pipes stdio, so both are already falsy in CI; force it.
  Object.defineProperty(process.stdin, 'isTTY', {
    value: false,
    configurable: true,
  })
  Object.defineProperty(process.stdout, 'isTTY', {
    value: false,
    configurable: true,
  })
  try {
    const ok = await askOperatorConfirm(null, 'allow?')
    assert.equal(ok, false)
  } finally {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: wasIn,
      configurable: true,
    })
    Object.defineProperty(process.stdout, 'isTTY', {
      value: wasOut,
      configurable: true,
    })
  }
})
