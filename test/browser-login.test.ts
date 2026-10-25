import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  interactiveBrowserLogin,
  canShowWindow,
  loginIsInteractive,
  classifyLoginProbe,
  LoginRequiredError,
  LoginCancelledError,
  type BrowserLoginDeps,
  type ProbeResult,
} from '../src/browser-login.ts'

// The sign-in policy is the OPERATOR's requirement: auto-login first, a
// visible window only when the automatic path fails, and back to headless
// afterwards. These tests pin that ORDER with injected doubles, so a
// regression cannot silently start opening a window on every launch.

function deps(over: Partial<BrowserLoginDeps> = {}): BrowserLoginDeps {
  return {
    provider: 'Test',
    probeLogin: async () => 'out',
    autoLogin: async () => false,
    relaunch: async () => {},
    openLoginPage: async () => {},
    gotoChat: async () => {},
    prefill: async () => {},
    captureCredentials: async () => {},
    persistSession: async () => {},
    notice: () => {},
    isAborted: () => false,
    windowClosed: () => false,
    sleep: async () => {},
    now: () => Date.now(),
    interactive: true,
    stayHeaded: false,
    guestAllowed: false,
    canShowWindow: true,
    timeoutMs: 5000,
    ...over,
  }
}

test('an active session returns without opening a window', async () => {
  const calls: string[] = []
  const out = await interactiveBrowserLogin(
    deps({
      probeLogin: async () => 'in',
      autoLogin: async () => {
        calls.push('auto')
        return true
      },
      relaunch: async () => {
        calls.push('relaunch')
      },
    }),
  )
  assert.equal(out, 'already')
  assert.deepEqual(calls, [])
})

test('auto-login runs FIRST, before any window', async () => {
  const calls: string[] = []
  const out = await interactiveBrowserLogin(
    deps({
      probeLogin: async () => 'out',
      autoLogin: async () => {
        calls.push('auto')
        return true
      },
      relaunch: async () => {
        calls.push('relaunch')
      },
      openLoginPage: async () => {
        calls.push('open')
      },
    }),
  )
  assert.equal(out, 'auto')
  assert.deepEqual(calls, ['auto'])
})

test('a guest is accepted without a window', async () => {
  const calls: string[] = []
  const out = await interactiveBrowserLogin(
    deps({
      guestAllowed: true,
      relaunch: async () => {
        calls.push('relaunch')
      },
    }),
  )
  assert.equal(out, 'guest')
  assert.deepEqual(calls, [])
})

test('non-interactive throws LoginRequiredError without a window', async () => {
  let relaunched = false
  await assert.rejects(
    interactiveBrowserLogin(
      deps({
        interactive: false,
        relaunch: async () => {
          relaunched = true
        },
      }),
    ),
    LoginRequiredError,
  )
  assert.equal(relaunched, false)
})

test('the window flow signs in, then returns to headless', async () => {
  let headed = false
  let headlessAgain = false
  let probeCount = 0
  const out = await interactiveBrowserLogin(
    deps({
      probeLogin: async (): Promise<ProbeResult> => {
        probeCount++
        return probeCount > 2 ? 'in' : 'out'
      },
      relaunch: async (h) => {
        if (h) headed = true
        else headlessAgain = true
      },
    }),
  )
  assert.equal(out, 'window')
  assert.equal(headed, true)
  assert.equal(headlessAgain, true)
})

test('a closed window counts as done when the session is active', async () => {
  let probeCount = 0
  const out = await interactiveBrowserLogin(
    deps({
      probeLogin: async (): Promise<ProbeResult> => {
        probeCount++
        return probeCount > 1 ? 'in' : 'out'
      },
      windowClosed: () => true,
    }),
  )
  assert.equal(out, 'window')
})

test('at most ONE headed<->headless cycle when the session does not carry over', async () => {
  const relaunches: boolean[] = []
  let probes = 0
  const out = await interactiveBrowserLogin(
    deps({
      probeLogin: async (): Promise<ProbeResult> => {
        probes++
        // First probe: out. Window: in. After the headless relaunch: out.
        // 1: out. 2: the window is up -> in. 3: after the headless
        // relaunch the session did not carry over -> out.
        if (probes === 1) return 'out'
        if (probes === 2) return 'in'
        return 'out'
      },
      relaunch: async (h) => {
        relaunches.push(h)
      },
    }),
  )
  assert.equal(out, 'window')
  assert.deepEqual(relaunches, [true, false, true])
})

test('the timeout gives up with LoginRequiredError', async () => {
  let t = 0
  await assert.rejects(
    interactiveBrowserLogin(
      deps({
        now: () => t,
        sleep: async () => {
          t += 1000
        },
        timeoutMs: 3000,
      }),
    ),
    LoginRequiredError,
  )
})

test('an abort during the wait throws LoginCancelledError', async () => {
  let aborted = false
  await assert.rejects(
    interactiveBrowserLogin(
      deps({
        isAborted: () => aborted,
        sleep: async () => {
          aborted = true
        },
      }),
    ),
    LoginCancelledError,
  )
})

test('canShowWindow is a preliminary display filter', () => {
  assert.equal(canShowWindow({}, 'win32'), true)
  assert.equal(canShowWindow({}, 'darwin'), true)
  assert.equal(canShowWindow({ DISPLAY: ':0' }, 'linux'), true)
  assert.equal(canShowWindow({}, 'linux'), false)
  assert.equal(
    canShowWindow({ DISPLAY: ':0', ZAMES_NONINTERACTIVE_LOGIN: '1' }, 'linux'),
    false,
  )
  assert.equal(canShowWindow({ DISPLAY: ':0', CI: 'true' }, 'linux'), false)
})

test('loginIsInteractive rejects one-shot, scheduled and non-TTY runs', () => {
  const env = {}
  assert.equal(
    loginIsInteractive({ isTTY: true, oneShot: false, scheduled: false, env }),
    true,
  )
  assert.equal(
    loginIsInteractive({ isTTY: true, oneShot: true, scheduled: false, env }),
    false,
  )
  assert.equal(
    loginIsInteractive({ isTTY: true, oneShot: false, scheduled: true, env }),
    false,
  )
  assert.equal(
    loginIsInteractive({ isTTY: false, oneShot: false, scheduled: false, env }),
    false,
  )
  assert.equal(
    loginIsInteractive({
      isTTY: true,
      oneShot: false,
      scheduled: false,
      env: { ZAMES_NONINTERACTIVE_LOGIN: '1' },
    }),
    false,
  )
})

test('classifyLoginProbe maps the page signals to in/out/challenge', () => {
  assert.equal(classifyLoginProbe({ role: 'user' }), 'in')
  // A guest with no sign-in control is a GUEST SESSION (it is not logged in,
  // but the guest limit, not a login, is what the caller needs to know).
  assert.equal(classifyLoginProbe({ role: 'guest' }), 'in')
  // With a sign-in control on the page the guest has NOT signed in yet.
  assert.equal(
    classifyLoginProbe({ role: 'guest', signInVisible: true }),
    'out',
  )
  assert.equal(classifyLoginProbe({ hasToken: true }), 'in')
  assert.equal(classifyLoginProbe({ hasToken: false }), 'out')
  assert.equal(classifyLoginProbe({ signInVisible: true }), 'out')
  assert.equal(classifyLoginProbe({ captcha: true }), 'challenge')
  assert.equal(classifyLoginProbe({}), 'unknown')
})
