import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import fss from 'fs'
import path from 'path'
import os from 'os'
import { runAgentLoop } from '../src/agent-loop.ts'
import {
  loadHooks,
  matchesHook,
  runPreToolUse,
  runPostToolUse,
} from '../src/hooks.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

function makeBrowser(script: string[]): BrowserLike {
  let i = 0
  return {
    async ask() {
      const r = script[i]
      i++
      if (r === undefined) throw new Error('script exhausted')
      return r
    },
    async newChat() {},
    async getCurrentChatId() {
      return 'chat-1'
    },
    async stopGeneration() {
      return true
    },
    async listChats() {
      return []
    },
    async openChat() {
      return true
    },
    async close() {},
  }
}

function respondTool(): ToolDef {
  return {
    name: 'respond',
    description: 'respond',
    parameters: { message: 'string' },
    fn: async (args) => String(args['message']),
  }
}

function call(tool: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool, args })
}

async function tmpdir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'zames-hooks-'))
}

async function writeHooks(dir: string, cfg: unknown): Promise<void> {
  await fs.mkdir(path.join(dir, '.zames'), { recursive: true })
  await fs.writeFile(
    path.join(dir, '.zames', 'hooks.json'),
    JSON.stringify(cfg),
    'utf-8',
  )
}

test('loadHooks: missing/malformed file yields empty config', async () => {
  const dir = await tmpdir()
  assert.deepEqual(loadHooks(dir), {})
  await fs.mkdir(path.join(dir, '.zames'), { recursive: true })
  await fs.writeFile(path.join(dir, '.zames', 'hooks.json'), '{not json')
  assert.deepEqual(loadHooks(dir), {})
})

test('loadHooks: parses matcher/command and skips bad entries', async () => {
  const dir = await tmpdir()
  await writeHooks(dir, {
    PreToolUse: [
      { matcher: '^Bash$', command: 'true' },
      { command: 'true' },
      { matcher: '^X$' },
      'nope',
    ],
  })
  const cfg = loadHooks(dir)
  assert.equal(cfg.PreToolUse?.length, 2)
  assert.equal(cfg.PreToolUse?.[0].matcher, '^Bash$')
  assert.equal(cfg.PreToolUse?.[1].matcher, undefined)
  assert.equal(cfg.PostToolUse, undefined)
})

test('matchesHook: empty matcher matches all, bad regex matches none', () => {
  assert.equal(matchesHook({ command: 'x' }, 'Bash'), true)
  assert.equal(matchesHook({ matcher: '^Edit$', command: 'x' }, 'Edit'), true)
  assert.equal(matchesHook({ matcher: '^Edit$', command: 'x' }, 'Bash'), false)
  assert.equal(matchesHook({ matcher: '([', command: 'x' }, 'Bash'), false)
})

test('runPreToolUse: non-zero exit blocks and returns stderr', async () => {
  const dir = await tmpdir()
  const cfg = {
    PreToolUse: [{ matcher: '^Bash$', command: 'echo nope 1>&2; exit 3' }],
  }
  const reason = await runPreToolUse(cfg, 'Bash', { command: 'rm -rf /' }, dir)
  assert.equal(reason, 'nope')
})

test('runPreToolUse: exit 0 allows; non-matching matcher is skipped', async () => {
  const dir = await tmpdir()
  const cfg = {
    PreToolUse: [{ matcher: '^Bash$', command: 'exit 9' }],
  }
  assert.equal(await runPreToolUse(cfg, 'Edit', {}, dir), null)
  assert.equal(await runPreToolUse({}, 'Bash', {}, dir), null)
  assert.equal(await runPreToolUse(null, 'Bash', {}, dir), null)
})

test('runPreToolUse: hook receives call JSON on stdin', async () => {
  const dir = await tmpdir()
  const out = path.join(dir, 'seen.json')
  const cfg = {
    PreToolUse: [
      { matcher: '^Write$', command: 'cat > ' + JSON.stringify(out) },
    ],
  }
  await runPreToolUse(cfg, 'Write', { path: 'a.txt' }, dir)
  const seen = JSON.parse(fss.readFileSync(out, 'utf-8'))
  assert.equal(seen.event, 'PreToolUse')
  assert.equal(seen.tool, 'Write')
  assert.deepEqual(seen.args, { path: 'a.txt' })
})

test('runPostToolUse: stdout collected, failure ignored', async () => {
  const dir = await tmpdir()
  const cfg = {
    PostToolUse: [
      { matcher: '^Edit$', command: 'echo formatted' },
      { matcher: '^Edit$', command: 'exit 1' },
      { matcher: '^Bash$', command: 'echo never' },
    ],
  }
  assert.equal(await runPostToolUse(cfg, 'Edit', {}, 'ok', dir), 'formatted')
  assert.equal(await runPostToolUse(cfg, 'Read', {}, 'ok', dir), '')
})

test('agent-loop: PreToolUse hook blocks a tool call', async () => {
  const dir = await tmpdir()
  await writeHooks(dir, {
    PreToolUse: [{ matcher: '^Write$', command: 'echo denied 1>&2; exit 1' }],
  })
  let ran = false
  const tools: ToolDef[] = [
    {
      name: 'Write',
      description: 'w',
      parameters: { path: 'string' },
      fn: async () => {
        ran = true
        return 'written'
      },
    },
    respondTool(),
  ]
  const script = [
    call('Write', { path: 'a.txt' }),
    call('respond', { message: 'done' }),
  ]
  const out = await runAgentLoop({
    browser: makeBrowser(script),
    tools,
    task: 't',
    workdir: dir,
  })
  assert.equal(ran, false, 'blocked tool must not run')
  assert.equal(out, 'done')
})

test('agent-loop: PostToolUse stdout appended to result', async () => {
  const dir = await tmpdir()
  await writeHooks(dir, {
    PostToolUse: [{ matcher: '^Echo$', command: 'echo post-says-hi' }],
  })
  const tools: ToolDef[] = [
    {
      name: 'Echo',
      description: 'e',
      parameters: {},
      fn: async () => 'tool-result',
    },
    respondTool(),
  ]
  const script = [call('Echo', {}), call('respond', { message: 'done' })]
  const seen: unknown[] = []
  await runAgentLoop({
    browser: makeBrowser(script),
    tools,
    task: 't',
    workdir: dir,
    onToolResult: (r) => seen.push(r),
  })
  assert.equal(seen.length, 1)
  assert.match(String(seen[0]), /tool-result/)
  assert.match(String(seen[0]), /post-says-hi/)
})

test('agent-loop: explicit null disables hooks', async () => {
  const dir = await tmpdir()
  await writeHooks(dir, {
    PreToolUse: [{ matcher: '^Write$', command: 'exit 1' }],
  })
  let ran = false
  const tools: ToolDef[] = [
    {
      name: 'Write',
      description: 'w',
      parameters: {},
      fn: async () => {
        ran = true
        return 'written'
      },
    },
    respondTool(),
  ]
  const script = [call('Write', {}), call('respond', { message: 'done' })]
  await runAgentLoop({
    browser: makeBrowser(script),
    tools,
    task: 't',
    workdir: dir,
    hooks: null,
  })
  assert.equal(ran, true)
})
