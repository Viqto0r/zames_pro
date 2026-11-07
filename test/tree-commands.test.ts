import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasStagedFlag,
  createTreeCommands,
  type TreeCommandDeps,
} from '../src/tree-commands.ts'
import { dispatchCommand } from '../src/command-registry.ts'

// N2 group (c): the /diff / /diffstat / /undo / /rewind commands. The work is
// INJECTED, so these tests pin the routing (names, aliases, flag and selector are forwarded).

function makeDeps(): {
  deps: TreeCommandDeps
  calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    deps: {
      diff: async (staged) => void calls.push('diff:' + staged),
      diffstat: async (staged) => void calls.push('diffstat:' + staged),
      undo: async () => void calls.push('undo'),
      undoList: async () => void calls.push('undoList'),
      rewindList: async () => void calls.push('rewindList'),
      rewind: async (selector, line) =>
        void calls.push('rewind:' + selector + '|' + line),
    },
  }
}

async function run(input: string): Promise<string[]> {
  const { deps, calls } = makeDeps()
  const commands = createTreeCommands(deps)
  const ok = await dispatchCommand(commands, input, {
    print: () => {},
    devMode: false,
  })
  assert.equal(ok, true, 'input must match: ' + input)
  return calls
}

test('hasStagedFlag detects the flag only as a whole token', () => {
  assert.equal(hasStagedFlag('/diff --staged'), true)
  assert.equal(hasStagedFlag('/diff --staged src'), true)
  assert.equal(hasStagedFlag('hello --staged'), true)
  assert.equal(hasStagedFlag('/diff --staged-foo'), false)
  assert.equal(hasStagedFlag('/diff --no-staged'), false)
  assert.equal(hasStagedFlag('/diff'), false)
})

test('/diff forwards the staged flag', async () => {
  assert.deepEqual(await run('/diff'), ['diff:false'])
  assert.deepEqual(await run('/diff --staged'), ['diff:true'])
  assert.deepEqual(await run('/diff src --staged'), ['diff:true'])
})

test('/diffstat forwards the staged flag', async () => {
  assert.deepEqual(await run('/diffstat'), ['diffstat:false'])
  assert.deepEqual(await run('/diffstat --staged'), ['diffstat:true'])
})

test('/undo and its alias /history route to undoList', async () => {
  assert.deepEqual(await run('/undo'), ['undo'])
  assert.deepEqual(await run('/undo-list'), ['undoList'])
  assert.deepEqual(await run('/history'), ['undoList'])
})

test('/rewind-list and its alias /checkpoints route to rewindList', async () => {
  assert.deepEqual(await run('/rewind-list'), ['rewindList'])
  assert.deepEqual(await run('/checkpoints'), ['rewindList'])
})

test('/rewind hands the first selector and the raw line to the handler', async () => {
  assert.deepEqual(await run('/rewind 3'), ['rewind:3|/rewind 3'])
  assert.deepEqual(await run('/rewind 2 --yes'), ['rewind:2|/rewind 2 --yes'])
})

test('/rewind with no selector defaults to 1', async () => {
  assert.deepEqual(await run('/rewind'), ['rewind:1|/rewind'])
})

test('the command names are exactly the six tree commands', () => {
  const names = createTreeCommands(makeDeps().deps).map((c) => c.name)
  assert.deepEqual(names, [
    'diff',
    'diffstat',
    'undo',
    'undo-list',
    'rewind-list',
    'rewind',
  ])
})
