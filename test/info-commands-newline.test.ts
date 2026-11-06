import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInfoCommands } from '../src/info-commands.ts'
import type { SlashCommand } from '../src/command-registry.ts'

// A chat id and the working directory are printed by `/chat` and `/pwd`.
// Neither is trusted text: the id comes from the page URL / the operator and
// the directory from the process cwd, so a NEWLINE in one of them started a
// line of its own in the terminal — the same `oneLine` rule every other
// report row already follows (`/status`, `/doctor`, `/context`).
const t = (k: string, p?: Record<string, string>) =>
  k + (p ? JSON.stringify(p) : '')

function commands(over: Record<string, unknown> = {}): SlashCommand[] {
  return createInfoCommands({
    t,
    statusLines: () => [],
    currentChatId: () => null,
    resolveChatId: async () => null,
    chatUrl: (id: string) => 'https://x/c/' + id,
    workdir: () => '/w',
    transcriptFile: () => null,
    costReport: async () => [],
    limitsReport: async () => [],
    memoryReport: async () => [],
    skillsReport: async () => [],
    ...over,
  } as never)
}

async function run(cmds: SlashCommand[], name: string): Promise<string[]> {
  const out: string[] = []
  const c = cmds.find((x) => x.name === name)
  assert.ok(c, 'missing command ' + name)
  await c.handler({ input: '/' + name, rest: '', print: (l) => out.push(l) })
  return out
}

test('a newline in the chat id does not start a new /chat line', async () => {
  const out = await run(commands({ currentChatId: () => 'a\nb' }), 'chat')
  for (const line of out) assert.ok(!line.includes('\n'), line)
})

test('a newline in the working directory does not fake a /pwd line', async () => {
  const out = await run(commands({ workdir: () => '/w\nFAKE' }), 'pwd')
  for (const line of out) {
    assert.ok(!line.includes('\n'), line)
    assert.ok(!/^FAKE$/.test(line), line)
  }
})
