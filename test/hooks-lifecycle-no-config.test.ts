import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.ts'
import { loadHooks, runLifecycleHooks, runPostToolUse } from '../src/hooks.ts'

// `run-task.ts` fired the Stop hook as `runLifecycleHooks(undefined, 'Stop', …)`
// — `undefined` instead of the loaded config. So a `.zames/hooks.json` Stop
// hook NEVER ran: the operator's cleanup/notification script silently did
// nothing at the end of every task, while the SAME file's PreToolUse hooks
// worked (they are loaded separately).
test('a Stop hook in .zames/hooks.json actually runs', async (t) => {
  const wd = await makeTmpDir(t, 'zames-hook-stop-')
  fs.mkdirSync(path.join(wd, '.zames'), { recursive: true })
  fs.writeFileSync(
    path.join(wd, '.zames', 'hooks.json'),
    JSON.stringify({ Stop: [{ command: 'echo stop-ran' }] }),
  )
  const hooks = loadHooks(wd)
  // This is the call shape the task runner must use: the LOADED config.
  const out = await runLifecycleHooks(hooks, 'Stop', wd, { failure: '' })
  assert.equal(out.trim(), 'stop-ran')
})

// The regression itself: the runner passed `undefined`. A structural guard
// because run-task.ts owns the browser and cannot be driven in a unit test.
test('run-task loads the hooks config before firing Stop', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/run-task.ts'),
    'utf-8',
  )
  assert.doesNotMatch(
    src,
    /runLifecycleHooks\(\s*undefined\s*,\s*'Stop'/,
    'the Stop hook is fired with an undefined config, so it never runs',
  )
})

// A PostToolUse hook keeps working (control): the same loader feeds it.
test('PostToolUse hooks still run from the same config', async (t) => {
  const wd = await makeTmpDir(t, 'zames-hook-post-')
  fs.mkdirSync(path.join(wd, '.zames'), { recursive: true })
  fs.writeFileSync(
    path.join(wd, '.zames', 'hooks.json'),
    JSON.stringify({
      PostToolUse: [{ matcher: '^Write$', command: 'echo post-ran' }],
    }),
  )
  const out = await runPostToolUse(loadHooks(wd), 'Write', {}, 'ok', wd)
  assert.equal(out.trim(), 'post-ran')
})
