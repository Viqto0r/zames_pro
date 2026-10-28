import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  matchCommand,
  dispatchCommand,
  type SlashCommand,
} from '../src/command-registry.ts'
import { createInfoCommands } from '../src/info-commands.ts'
import { translate } from '../src/i18n.ts'

// N2: the slash-command REGISTRY. The routing must be exact (a prefix like
// `/statusx` is NOT `/status`), aliases must work, a dev-only command must be
// rejected for a regular user, and the informational group must print through
// the injected callbacks (no live agent needed).

const t = translate('en')

function info(over: Record<string, unknown> = {}): SlashCommand[] {
  return createInfoCommands({
    t,
    statusLines: () => ['status line'],
    currentChatId: () => 'chat-1',
    resolveChatId: async () => 'chat-2',
    chatUrl: (id) => 'https://chat.example/' + id,
    workdir: () => '/proj',
    transcriptFile: () => '/tmp/t.jsonl',
    costReport: () => ['cost line'],
    limitsReport: () => ['limits line'],
    memoryReport: async () => ['memory line'],
    skillsReport: async () => ['skill line'],
    ...over,
  })
}

async function run(commands: SlashCommand[], input: string): Promise<string[]> {
  const out: string[] = []
  const handled = await dispatchCommand(commands, input, {
    print: (l) => out.push(l),
    devMode: false,
  })
  assert.equal(handled, true, 'not handled: ' + input)
  return out.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''))
}

test('a command matches exactly, a prefix does not', () => {
  const cmds = info()
  assert.equal(matchCommand(cmds, '/status')?.command.name, 'status')
  assert.equal(matchCommand(cmds, '/statusx'), null)
  assert.equal(matchCommand(cmds, '/stats'), null)
  assert.equal(matchCommand(cmds, 'status'), null)
})

test('the match is case-insensitive and carries the arguments', () => {
  const cmds = info()
  const hit = matchCommand(cmds, '  /CoSt --since 1d ')
  assert.equal(hit?.command.name, 'cost')
  assert.equal(hit?.rest, '--since 1d')
})

test('an alias dispatches to the same handler', async () => {
  const lines = await run(info(), '/usage')
  assert.deepEqual(lines, ['cost line'])
})

test('/chat prints the id and the URL of the active chat', async () => {
  const lines = await run(info(), '/chat')
  assert.ok(lines.some((l) => l.includes('chat-1')))
  assert.ok(lines.some((l) => l.includes('https://chat.example/chat-1')))
})

test('/chat falls back to the live lookup when no id is cached', async () => {
  const lines = await run(info({ currentChatId: () => null }), '/chat')
  assert.ok(lines.some((l) => l.includes('chat-2')))
})

test('the informational commands print through ctx.print', async () => {
  assert.deepEqual(await run(info(), '/status'), ['status line'])
  assert.deepEqual(await run(info(), '/pwd'), ['/proj'])
  assert.deepEqual(await run(info(), '/limits'), ['limits line'])
  assert.deepEqual(await run(info(), '/memory'), ['memory line'])
  assert.deepEqual(await run(info(), '/skills'), ['skill line'])
})

test('a dev-only command is rejected for a regular user', async () => {
  const rejected: string[] = []
  const cmds: SlashCommand[] = [
    { name: 'improve', devOnly: true, handler: () => assert.fail('ran') },
  ]
  const handled = await dispatchCommand(cmds, '/improve', {
    print: () => {},
    devMode: false,
    onDevOnlyRejected: (n) => rejected.push(n),
  })
  assert.equal(handled, true)
  assert.deepEqual(rejected, ['improve'])
  // In dev mode the same command RUNS.
  let ran = false
  await dispatchCommand(
    [{ name: 'improve', devOnly: true, handler: () => void (ran = true) }],
    '/improve',
    { print: () => {}, devMode: true },
  )
  assert.equal(ran, true)
})

test('an unknown line is not handled', async () => {
  const handled = await dispatchCommand(info(), '/nope', {
    print: () => {},
    devMode: false,
  })
  assert.equal(handled, false)
})

// N2 group (b): session and chat commands. The handlers are injected, so the
// ROUTING (names, aliases, argument forwarding) is what this test pins.
test('the session group routes names, aliases and arguments', async () => {
  const { createSessionCommands } = await import('../src/session-commands.ts')
  const calls: string[] = []
  const cmds = createSessionCommands({
    t,
    newChat: async () => void calls.push('new'),
    sessions: async (f) => void calls.push('sessions:' + f),
    chats: async (f) => void calls.push('chats:' + f),
    last: async () => void calls.push('last'),
    resumeId: async (id) => void calls.push('resume:' + id),
    parseResumeId: (raw) => (raw.trim() ? raw.trim() : null),
    printResumeUsage: () => void calls.push('usage'),
  })
  const dispatch = async (line: string): Promise<void> => {
    const ok = await dispatchCommand(cmds, line, {
      print: () => {},
      devMode: false,
    })
    assert.equal(ok, true, 'not handled: ' + line)
  }
  await dispatch('/new')
  await dispatch('/clear')
  await dispatch('/sessions rust')
  await dispatch('/session')
  await dispatch('/chats abc')
  await dispatch('/last')
  await dispatch('/resume-id chat-42')
  await dispatch('/resume-id')
  assert.deepEqual(calls, [
    'new',
    'new',
    'sessions:rust',
    'sessions:',
    'chats:abc',
    'last',
    'resume:chat-42',
    'usage',
  ])
})

// N2 group (c): git / undo / rewind. The `--staged` flag must be recognised
// in any position, `/history` and `/checkpoints` are aliases, and `/rewind`
// forwards its selector plus the raw line (the `--yes` flag lives there).
test('the tree group routes flags, aliases and the rewind selector', async () => {
  const { createTreeCommands, hasStagedFlag } =
    await import('../src/tree-commands.ts')
  const calls: string[] = []
  const cmds = createTreeCommands({
    diff: async (s) => void calls.push('diff:' + s),
    diffstat: async (s) => void calls.push('diffstat:' + s),
    undo: async () => void calls.push('undo'),
    undoList: async () => void calls.push('undo-list'),
    rewindList: async () => void calls.push('rewind-list'),
    rewind: async (sel, line) => void calls.push('rewind:' + sel + ':' + line),
  })
  const dispatch = async (line: string): Promise<void> => {
    const ok = await dispatchCommand(cmds, line, {
      print: () => {},
      devMode: false,
    })
    assert.equal(ok, true, 'not handled: ' + line)
  }
  await dispatch('/diff')
  await dispatch('/diff --staged')
  await dispatch('/diffstat --staged')
  await dispatch('/undo')
  await dispatch('/history')
  await dispatch('/checkpoints')
  await dispatch('/rewind 3 --yes')
  await dispatch('/rewind')
  assert.deepEqual(calls, [
    'diff:false',
    'diff:true',
    'diffstat:true',
    'undo',
    'undo-list',
    'rewind-list',
    'rewind:3:/rewind 3 --yes',
    'rewind:1:/rewind',
  ])
})

test('hasStagedFlag matches the flag only as a separate word', async () => {
  const { hasStagedFlag } = await import('../src/tree-commands.ts')
  assert.equal(hasStagedFlag('/diff --staged'), true)
  assert.equal(hasStagedFlag('/diff --stagedx'), false)
  assert.equal(hasStagedFlag('/diff --unstaged'), false)
  assert.equal(hasStagedFlag('/diff'), false)
})

// N2 group (d): the scheduler + compact commands, and the /goal fall-through.
// A goal that was just SET must become the task directive instead of ending
// the loop; /compact, /loop, /cron and /jobs are ordinary dispatch entries.
test('the scheduler group routes compact, loop, cron and jobs', async () => {
  const { createSchedulerCommands } =
    await import('../src/scheduler-commands.ts')
  const calls: string[] = []
  const cmds = createSchedulerCommands({
    compact: async () => void calls.push('compact'),
    goal: async () => 'handled',
    currentGoal: () => null,
    loop: (rest) => void calls.push('loop:' + rest),
    cron: (rest) => void calls.push('cron:' + rest),
    jobs: (rest) => void calls.push('jobs:' + rest),
  })
  const dispatch = async (line: string): Promise<void> => {
    const ok = await dispatchCommand(cmds, line, {
      print: () => {},
      devMode: false,
    })
    assert.equal(ok, true, 'not handled: ' + line)
  }
  await dispatch('/compact')
  await dispatch('/loop 10m run tests')
  await dispatch('/cron 0 3 * * * backup')
  await dispatch('/jobs rm 2')
  await dispatch('/jobs')
  assert.deepEqual(calls, [
    'compact',
    'loop:10m run tests',
    'cron:0 3 * * * backup',
    'jobs:rm 2',
    'jobs:',
  ])
})

test('a goal that was just SET becomes the next task directive', async () => {
  const { goalDirective, GOAL_TASK_OVERRIDE } =
    await import('../src/scheduler-commands.ts')
  assert.equal(goalDirective({ currentGoal: () => null }, true), null)
  assert.equal(
    goalDirective({ currentGoal: () => 'all tests pass' }, false),
    null,
  )
  assert.equal(
    goalDirective({ currentGoal: () => 'all tests pass' }, true),
    GOAL_TASK_OVERRIDE,
  )
})

// N2 group (e): the dev-only commands. The registry list and the historical
// DEV_ONLY_COMMANDS (used by /help filtering) must name the SAME commands, and
// a regular user must be rejected before the handler runs.
test('the dev group matches DEV_ONLY_COMMANDS and is gated by dev mode', async () => {
  const { createDevCommands } = await import('../src/dev-commands.ts')
  const { DEV_ONLY_COMMANDS } = await import('../src/commands.ts')
  const noop = async (): Promise<void> => {}
  const cmds = createDevCommands({
    improve: noop,
    backlog: noop,
    selfReview: noop,
    selfFix: noop,
    selfDone: noop,
    selfList: noop,
    selfDiff: noop,
    selfApply: noop,
  })
  assert.deepEqual(
    cmds.map((c) => '/' + c.name).sort(),
    [...DEV_ONLY_COMMANDS].sort(),
  )
  assert.ok(cmds.every((c) => c.devOnly))
  let ran = 0
  const calls: string[] = []
  const handled = await dispatchCommand(
    [
      {
        name: 'self-list',
        devOnly: true,
        handler: () => {
          ran++
        },
      },
    ],
    '/self-list',
    {
      print: (l) => calls.push(l),
      devMode: false,
      onDevOnlyRejected: (n) => calls.push('rejected:' + n),
    },
  )
  assert.equal(handled, true)
  assert.equal(ran, 0)
  assert.deepEqual(calls, ['rejected:self-list'])
})
