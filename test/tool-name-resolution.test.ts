import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'

// The tool is resolved by an EXACT name match (`t.name === call.tool`), and
// the model regularly pads a name with a space/newline or changes its case
// (`"tool": " Bash "`, `bash`). Such a call is reported as
// `Unknown tool: Bash ` — the model then repeats the same call, because the
// answer looks valid to it, and the loop burns its retries until it stops.
//
// The loop must resolve the name CASE-INSENSITIVELY and after trimming, which
// is what this test pins through the public agent-loop surface: a call for
// ` bash ` runs the real Bash tool.
test('a padded / upper-cased tool name still resolves', async () => {
  const answers = [
    JSON.stringify({ tool: ' bash ', args: { command: 'echo hi' } }),
    JSON.stringify({ tool: 'respond', args: { message: 'done' } }),
  ]
  let sent = 0
  const asked: string[] = []
  const browser = {
    async ask(prompt: string) {
      asked.push(prompt)
      return answers[sent++] ?? ''
    },
    onSendStart: null,
    onSendPause: null,
    onNotice: null,
    onContextLimit: null,
    getLastTokenUsage: () => null,
    stopGeneration() {},
  }
  const tools = [
    {
      name: 'Bash',
      description: 'run',
      parameters: { type: 'object', properties: {} },
      fn: async () => 'ran',
    },
    {
      name: 'respond',
      description: 'answer',
      parameters: { type: 'object', properties: {} },
      fn: async () => 'ok',
    },
  ] as never
  const res = await runAgentLoop({
    browser: browser as never,
    tools: tools as never,
    task: 'go',
    maxIterations: 4,
    workdir: process.cwd(),
    locale: 'en',
  })
  // The Bash tool must have RUN (its result went back to the model) instead of
  // an `Unknown tool` error.
  assert.equal(
    asked.some((a) => a.includes('Unknown tool')),
    false,
    'the padded name was reported as unknown',
  )
  assert.ok(res !== undefined)
})
