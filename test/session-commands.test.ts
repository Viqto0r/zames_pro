import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createSessionCommands,
  resumeIdUsage,
  type SessionCommandDeps,
} from '../src/session-commands.ts'
import { dispatchCommand } from '../src/command-registry.ts'
import { translate } from '../src/i18n.ts'

// N2 group (b): /new (/clear), /sessions (/session), /chats, /last,
// /resume-id. The live browser and the session store are INJECTED, so these
// tests pin the routing and the argument normalization.

const t = translate('en')

function makeDeps(): { deps: SessionCommandDeps; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    deps: {
      t,
      newChat: async () => void calls.push('new'),
      sessions: async (f) => void calls.push('sessions:' + f),
      chats: async (f) => void calls.push('chats:' + f),
      last: async () => void calls.push('last'),
      resumeId: async (id) => void calls.push('resume:' + id),
      parseResumeId: (raw) => {
        const v = raw.trim()
        return v ? v : null
      },
      printResumeUsage: () => void calls.push('usage'),
    },
  }
}

async function run(deps: SessionCommandDeps, line: string): Promise<string[]> {
  const calls: string[] = []
  // Re-wrap the callbacks so each run gets its own recorder.
  const wrapped: SessionCommandDeps = {
    ...deps,
    newChat: async () => void calls.push('new'),
    sessions: async (f) => void calls.push('sessions:' + f),
    chats: async (f) => void calls.push('chats:' + f),
    last: async () => void calls.push('last'),
    resumeId: async (id) => void calls.push('resume:' + id),
    printResumeUsage: () => void calls.push('usage'),
  }
  const ok = await dispatchCommand(createSessionCommands(wrapped), line, {
    print: () => {},
    devMode: false,
  })
  assert.equal(ok, true, 'not handled: ' + line)
  return calls
}

test('the group exposes exactly the five session commands', () => {
  const names = createSessionCommands(makeDeps().deps).map((c) => c.name)
  assert.deepEqual(names, ['new', 'sessions', 'chats', 'last', 'resume-id'])
})

test('the aliases are clear for /new and session for /sessions', () => {
  const cmds = createSessionCommands(makeDeps().deps)
  const byName = new Map(cmds.map((c) => [c.name, c.aliases ?? []]))
  assert.deepEqual(byName.get('new'), ['clear'])
  assert.deepEqual(byName.get('sessions'), ['session'])
  assert.deepEqual(byName.get('chats'), [])
  assert.deepEqual(byName.get('last'), [])
  assert.deepEqual(byName.get('resume-id'), [])
})

test('/new and /clear both open a fresh chat', async () => {
  const { deps } = makeDeps()
  assert.deepEqual(await run(deps, '/new'), ['new'])
  assert.deepEqual(await run(deps, '/clear'), ['new'])
})

test('/sessions and /session forward a LOWERCASED filter', async () => {
  const { deps } = makeDeps()
  assert.deepEqual(await run(deps, '/sessions Rust'), ['sessions:rust'])
  assert.deepEqual(await run(deps, '/session FIX'), ['sessions:fix'])
  assert.deepEqual(await run(deps, '/sessions'), ['sessions:'])
})

test('/chats forwards a lowercased filter', async () => {
  const { deps } = makeDeps()
  assert.deepEqual(await run(deps, '/chats My Chat'), ['chats:my chat'])
  assert.deepEqual(await run(deps, '/chats'), ['chats:'])
})

test('/last reopens the last chat of the directory', async () => {
  const { deps } = makeDeps()
  assert.deepEqual(await run(deps, '/last'), ['last'])
})

test('/resume-id passes a VALIDATED id and never the raw text', async () => {
  const calls: string[] = []
  const deps: SessionCommandDeps = {
    ...makeDeps().deps,
    resumeId: async (id) => void calls.push('resume:' + id),
    parseResumeId: () => 'normalized-id',
  }
  assert.deepEqual(await run(deps, '/resume-id   RAW TEXT  '), [
    'resume:normalized-id',
  ])
  assert.deepEqual(calls, [])
})

test('/resume-id with a rejected id prints the usage and opens nothing', async () => {
  const deps: SessionCommandDeps = {
    ...makeDeps().deps,
    parseResumeId: () => null,
  }
  assert.deepEqual(await run(deps, '/resume-id'), ['usage'])
  assert.deepEqual(await run(deps, '/resume-id bad'), ['usage'])
})

test('resumeIdUsage is the localized error line', () => {
  const en = resumeIdUsage(translate('en'))
  const ru = resumeIdUsage(translate('ru'))
  assert.match(en, /\/resume-id <chat id>/)
  assert.match(ru, /\/resume-id <chat id>/)
  assert.notEqual(en, ru)
})
