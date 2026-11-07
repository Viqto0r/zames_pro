import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createInfoCommands,
  type InfoCommandDeps,
} from '../src/info-commands.ts'
import { dispatchCommand } from '../src/command-registry.ts'
import { translate } from '../src/i18n.ts'

// N2 group (a): the informational commands. Everything is INJECTED, so the
// routing, the /chat fallback and the printed lines are pinned here (the
// newline flattening has its own two files).

const t = translate('en')

function makeDeps(over: Partial<InfoCommandDeps> = {}): InfoCommandDeps {
  return {
    t,
    statusLines: () => ['status line'],
    currentChatId: () => 'chat-1',
    resolveChatId: async () => null,
    chatUrl: (id) => 'https://chat.example/' + id,
    workdir: () => '/proj',
    transcriptFile: () => '/tmp/t.jsonl',
    costReport: () => ['cost line'],
    limitsReport: () => ['limits line'],
    memoryReport: async () => ['memory line'],
    skillsReport: async () => ['skill line'],
    ...over,
  }
}

async function run(deps: InfoCommandDeps, line: string): Promise<string[]> {
  const out: string[] = []
  const ok = await dispatchCommand(createInfoCommands(deps), line, {
    print: (l) => out.push(l),
    devMode: false,
  })
  assert.equal(ok, true, 'not handled: ' + line)
  return out
}

test('the group exposes exactly the eight informational commands', () => {
  const names = createInfoCommands(makeDeps()).map((c) => c.name)
  assert.deepEqual(names, [
    'status',
    'chat',
    'pwd',
    'transcript',
    'cost',
    'limits',
    'memory',
    'skills',
  ])
})

test('/cost has the /usage alias', () => {
  const cost = createInfoCommands(makeDeps()).find((c) => c.name === 'cost')
  assert.deepEqual(cost?.aliases, ['usage'])
})

test('every report command prints its injected lines', async () => {
  const deps = makeDeps()
  assert.equal((await run(deps, '/status')).length, 1)
  assert.equal((await run(deps, '/cost')).length, 1)
  assert.equal((await run(deps, '/usage')).length, 1)
  assert.equal((await run(deps, '/limits')).length, 1)
  assert.equal((await run(deps, '/memory')).length, 1)
  assert.equal((await run(deps, '/skills')).length, 1)
})

test('an async report is awaited before it is printed', async () => {
  const deps = makeDeps({
    costReport: async () => ['a', 'b'],
  })
  const out = await run(deps, '/cost')
  assert.equal(out.length, 2)
})

test('/pwd prints the workdir', async () => {
  assert.equal((await run(makeDeps(), '/pwd')).length, 1)
})

test('/chat prints the id and the URL when a chat is cached', async () => {
  const out = await run(makeDeps(), '/chat')
  assert.equal(out.length, 2)
  assert.match(out[0], /chat-1/)
  assert.match(out[1], /https:\/\/chat\.example\/chat-1/)
})

test('/chat falls back to the LIVE lookup and prints only the id', async () => {
  const deps = makeDeps({
    currentChatId: () => null,
    resolveChatId: async () => 'live-9',
  })
  const out = await run(deps, '/chat')
  assert.equal(out.length, 1)
  assert.match(out[0], /live-9/)
})

test('/chat with no chat at all prints the localized notice', async () => {
  const deps = makeDeps({
    currentChatId: () => null,
    resolveChatId: async () => null,
  })
  const out = await run(deps, '/chat')
  assert.deepEqual(out, [t('chats.not_created')])
})

test('/transcript prints the file path, or the off label when disabled', async () => {
  assert.equal((await run(makeDeps(), '/transcript')).length, 1)
  const off = await run(makeDeps({ transcriptFile: () => null }), '/transcript')
  assert.deepEqual(off, [t('common.off')])
})
