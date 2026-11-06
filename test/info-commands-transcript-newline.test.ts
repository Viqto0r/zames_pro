import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInfoCommands } from '../src/info-commands.ts'
import type { SlashCommand } from '../src/command-registry.ts'

// `/transcript` prints the transcript FILE PATH. That path is built from the
// session name — the working-directory label — and on POSIX a directory name
// can legally contain a newline. The handler was the ONE value in the group
// printed WITHOUT the shared `oneLine` flattening, so such a path started a
// line of its own in the terminal (the same rule `/chat` and `/pwd` already
// follow).

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

test('a newline in the transcript path stays on one line', async () => {
  const out = await run(
    commands({
      transcriptFile: () => '/home/a' + String.fromCharCode(10) + 'b.jsonl',
    }),
    'transcript',
  )
  assert.equal(out.length, 1)
  assert.ok(!out[0].includes(String.fromCharCode(10)), out[0])
})
