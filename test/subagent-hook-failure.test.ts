// Subagent runner: a FAILED subagent must not lose its diagnostic.
//
// The SubagentStop hook's stdout is appended to a SUCCESSFUL report. On a
// failure the runner returned `failed` alone, so a hook that explains WHY the
// subagent died (a cleanup script printing the broken state) was thrown away —
// exactly the moment its output matters most.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createSubagentRunner } from '../src/subagent.ts'

async function mkWorkdirWithHook(command: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-sub-'))
  await fs.mkdir(path.join(root, '.zames'), { recursive: true })
  await fs.writeFile(
    path.join(root, '.zames', 'hooks.json'),
    JSON.stringify({ SubagentStop: [{ command }] }),
  )
  return root
}

test('a failing subagent keeps the SubagentStop hook output', async () => {
  const workdir = await mkWorkdirWithHook('printf HOOK_DIAGNOSTIC')
  const runner = createSubagentRunner({
    browser: {
      _stopped: false,
      _abort: false,
      async stopGeneration() {
        return true
      },
      async getCurrentChatId() {
        return 'parent-chat'
      },
      async newChat() {},
      async openChat() {
        return true
      },
    } as never,
    workdir,
    locale: 'en',
    runAgentLoop: (async () => {
      throw new Error('nested loop exploded')
    }) as never,
    buildTools: () => [],
    maxSubagents: 1,
    askDeadlineMs: 1000,
    maxAfterToolRetries: 1,
  })
  const res = await runner({ prompt: 'p', description: 'd', type: 'general' })
  assert.equal(res.ok, false)
  assert.ok(
    res.text.includes('HOOK_DIAGNOSTIC'),
    'hook output must survive a failure: ' + res.text,
  )
  assert.ok(res.text.includes('nested loop exploded'))
  await fs.rm(workdir, { recursive: true, force: true })
})
