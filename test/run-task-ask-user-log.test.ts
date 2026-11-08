import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runTask, type RunTaskDeps } from '../src/run-task.ts'
import { translate } from '../src/i18n.ts'
import type { ToolDef } from '../src/types.ts'

// The DEFAULT `onAskUser` built by runTask: the Ink modal is a separate app
// whose frame is erased on unmount, so the question and the operator's answer
// must be printed ABOVE the input line — otherwise the exchange leaves no
// trace in the terminal or the chat history. Without an editor the seam must
// resolve null (the model then picks a default). Both are pinned here with a
// fake editor and a fake loop that just hands the callback out.

const t = translate('en')
const noTools: ToolDef[] = []

function makeEditor() {
  const above: string[] = []
  const calls: string[] = []
  return {
    above,
    calls,
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    printAbove: (s: string) => above.push(String(s)),
    setPending() {},
    thinking() {},
    sendPause() {},
    setSendState() {},
    toolCall() {},
    toolResult() {},
    assistant() {},
    warning() {},
    stop() {},
  }
}

async function grabSeam(editor: unknown): Promise<unknown> {
  let seam: unknown
  const deps = {
    t,
    locale: 'en',
    debug: false,
    maxIter: 1,
    config: { browser: { askDeadlineMs: 1000, maxAfterToolRetries: 1 } },
    runAgentLoop: (async (opts: Record<string, unknown>) => {
      seam = opts.onAskUser
      return '{"tool":"respond","args":{"message":"done"}}'
    }) as unknown as RunTaskDeps['runAgentLoop'],
    createSpinner: (() => ({
      setPending() {},
      thinking() {},
      sendPause() {},
      setSendState() {},
      toolCall() {},
      toolResult() {},
      assistant() {},
      warning() {},
      stop() {},
    })) as unknown as RunTaskDeps['createSpinner'],
    onAssistantMessage: () => {},
  } as unknown as RunTaskDeps
  const browser = {
    _stopped: false,
    _abort: false,
    async stopGeneration() {
      return true
    },
  }
  await runTask(deps, browser as never, noTools, 'ask', process.cwd(), {
    transcript: { log() {} } as never,
    freshChat: false,
    sendSystemPrompt: false,
    queue: [],
    ui: editor as never,
  } as never)
  return seam
}

test('without an editor the AskUser seam resolves null', async () => {
  const seam = (await grabSeam(null)) as (r: unknown) => Promise<string | null>
  assert.equal(await seam({ question: 'q', options: ['a', 'b'] }), null)
})

test('the question and the answer are printed above the input line', async () => {
  const editor = makeEditor()
  const seam = (await grabSeam(editor)) as (
    r: unknown,
  ) => Promise<string | null>
  const answer = await seam({
    question: 'which one?',
    options: ['a', 'b'],
    recommended: 1,
    allowText: false,
  })
  // A non-TTY Ink modal resolves null; the LOG must still be printed.
  assert.equal(answer, null)
  assert.deepEqual(editor.calls, ['pause', 'resume'])
  // runTask also prints its per-task summary above the line; the AskUser
  // block is the first pair.
  assert.ok(editor.above.length >= 2)
  const ask = editor.above.find((l) => l.includes('which one?'))
  assert.ok(ask, JSON.stringify(editor.above))

  assert.ok(ask!.includes('* b'))
  assert.ok(editor.above.some((l) => l.includes('no answer')))
})
