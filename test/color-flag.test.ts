import { test } from 'node:test'
import assert from 'node:assert/strict'

// `src/color.ts` has NO exported value: it is an import-time SIDE EFFECT that
// must run before anything pulls in chalk, because chalk reads NO_COLOR at
// module-load time. It therefore never appears in the coverage report and can
// only be pinned by actually loading it with a controlled argv/env. Each case
// loads a FRESH copy (`?fresh=N`) so the module body really executes instead of
// hitting the module cache.

let n = 0
async function loadColorModule(): Promise<void> {
  n++
  await import('../src/color.ts?fresh=' + n)
}

function withArgvEnv<T>(
  argv: string[],
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const argvDesc = Object.getOwnPropertyDescriptor(process, 'argv')
  const saved: Record<string, string | undefined> = {}
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k]
    if (env[k] === undefined) delete process.env[k]
    else process.env[k] = env[k]
  }
  Object.defineProperty(process, 'argv', {
    value: argv,
    configurable: true,
    writable: true,
  })
  const restore = () => {
    if (argvDesc) Object.defineProperty(process, 'argv', argvDesc)
    for (const k of Object.keys(env)) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
  return fn().finally(restore)
}

test('--no-color turns NO_COLOR on', async () => {
  await withArgvEnv(
    ['node', 'zames', '--no-color'],
    { NO_COLOR: undefined },
    async () => {
      await loadColorModule()
      assert.equal(process.env.NO_COLOR, '1')
    },
  )
})

test('without the flag NO_COLOR is left alone', async () => {
  await withArgvEnv(
    ['node', 'zames', '--task', 'hello'],
    { NO_COLOR: undefined },
    async () => {
      await loadColorModule()
      assert.equal(process.env.NO_COLOR, undefined)
    },
  )
})

test('an explicit NO_COLOR is not overwritten when the flag is absent', async () => {
  await withArgvEnv(['node', 'zames'], { NO_COLOR: '0' }, async () => {
    await loadColorModule()
    // The module never CLEARS the variable: `NO_COLOR=0` still means
    // "present", which is what no-color.org specifies and chalk checks.
    assert.equal(process.env.NO_COLOR, '0')
  })
})

test('the flag is matched EXACTLY, not as a substring', async () => {
  await withArgvEnv(
    ['node', 'zames', '--no-colors', 'x--no-color'],
    { NO_COLOR: undefined },
    async () => {
      await loadColorModule()
      assert.equal(process.env.NO_COLOR, undefined)
    },
  )
})

test('the flag works anywhere in argv, including right after the binary', async () => {
  for (const argv of [
    ['node', '--no-color', 'zames'],
    ['node', 'zames', 'run', '--no-color'],
  ]) {
    await withArgvEnv(argv, { NO_COLOR: undefined }, async () => {
      await loadColorModule()
      assert.equal(process.env.NO_COLOR, '1', argv.join(' '))
    })
  }
})

test('a --no-color value form does not count as the bare flag', async () => {
  // `--no-color=1` is NOT the documented flag; only the bare token is.
  await withArgvEnv(
    ['node', 'zames', '--no-color=1'],
    { NO_COLOR: undefined },
    async () => {
      await loadColorModule()
      assert.equal(process.env.NO_COLOR, undefined)
    },
  )
})

test('re-importing does not undo an explicit NO_COLOR', async () => {
  await withArgvEnv(['node', 'zames'], { NO_COLOR: 'x' }, async () => {
    await loadColorModule()
    await loadColorModule()
    assert.equal(process.env.NO_COLOR, 'x')
  })
})
