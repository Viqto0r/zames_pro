// Interactive, BROWSER-BASED sign-in — shared by every provider.
//
// WHY: DeepSeek (and now z.ai) often answers a headless login with a captcha
// that neither a terminal prompt nor a filled form can pass. A human has to
// sign in inside a VISIBLE window; zames then notices the session and goes
// back to headless. Before this module each provider had its own ad-hoc flow,
// so the policy lived in three places and none of them offered the window.
//
// The module is PURE in the sense that it owns NO Playwright and NO disk: the
// browser supplies `probeLogin`, `relaunch`, `openLoginPage`, ... and the
// decision sequence below is unit-tested with injected doubles
// (test/browser-login.test.ts).
//
// Order (the operator's requirement):
//   1. probeLogin() === 'in'            -> done, no window at all
//   2. autoLogin() with saved creds     -> done (this is the FIRST step after
//                                          the probe; credentials are permanent)
//   3. guest is allowed and no login was requested -> work as a guest
//   4. not interactive                  -> LoginRequiredError (fast, no window,
//                                          so a cold login fails instead of
//                                          hanging)
//   5. no display                       -> fall back to the in-TUI forms
//   6. headless                         -> relaunchSafe(headed), sign in
//   7. wait until probeLogin() === 'in' (poll), the operator closes the window
//      (= done) or presses Esc (= cancel)
//   8. save credentials captured from the form, persist the session marker
//   9. not stayHeaded                   -> relaunchSafe(headless); if the
//                                          session did not carry over, go back
//                                          to headed ONCE and stay there.

// `stayHeaded` is true for --headed, headless:false, --dev and hotReload: a
// developer watching the window must keep it open, and an operator who asked
// for a visible browser must not have it disappear after login.

export type ProbeResult = 'in' | 'out' | 'challenge' | 'unknown'

/** A sign-in is required and no interactive window can be offered. */
export class LoginRequiredError extends Error {
  constructor(provider: string) {
    super(provider + ': a sign-in is required (non-interactive)')
    this.name = 'LoginRequiredError'
  }
}

/** The operator cancelled the sign-in (Esc / Ctrl+C). */
export class LoginCancelledError extends Error {
  constructor() {
    super('sign-in cancelled')
    this.name = 'LoginCancelledError'
  }
}

export interface BrowserLoginDeps {
  provider: string
  /** Fast, no long waits: token/cookie presence or a cheap API answer. */
  probeLogin: () => Promise<ProbeResult>
  /** Try the saved credentials (the EXISTING auto-login). */
  autoLogin: () => Promise<boolean>
  /** Relaunch the persistent context in the requested mode, keeping session
   *  cookies that live only in memory (session cookies). */
  relaunch: (headless: boolean) => Promise<void>
  /** Navigate to the provider's login page (and remember the chat URL to
   *  return to afterwards). */
  openLoginPage: () => Promise<void>
  /** Return to the chat page once signed in (the user may be on /auth). */
  gotoChat: () => Promise<void>
  /** Prefill the saved login in the login form (best-effort). */
  prefill: () => Promise<void>
  /** Hook the page's login form so the entered credentials reach Node. */
  captureCredentials: () => Promise<void>
  /** Persist the "signed in" marker (per provider). */
  persistSession: () => Promise<void>
  /** Show a message to the operator (through the UI notice hook). */
  notice: (text: string) => void
  /** True when the operator pressed Esc / Ctrl+C. */
  isAborted: () => boolean
  /** True when the operator closed the browser window (counts as "done"). */
  windowClosed: () => boolean
  sleep: (ms: number) => Promise<void>
  now: () => number
  /** A TTY is available and the run is interactive (not --task/loop/cron). */
  interactive: boolean
  /** Keep the window visible after a successful sign-in. */
  stayHeaded: boolean
  /** The site answers an unsigned visitor (a guest) at all. */
  guestAllowed: boolean
  /** A window can be shown (see canShowWindow). */
  canShowWindow: boolean
  /** In-TUI fallback when no window can be shown (returns true on success). */
  tuiLogin?: () => Promise<boolean>
  /** Max time to wait for the operator to finish signing in. */
  timeoutMs: number
}

export type LoginOutcome = 'already' | 'auto' | 'guest' | 'window' | 'tui'

export async function interactiveBrowserLogin(
  deps: BrowserLoginDeps,
): Promise<LoginOutcome> {
  // 1) A live session: nothing to do (and no window flashes).
  const first = await deps.probeLogin().catch(() => 'unknown' as ProbeResult)
  if (first === 'in') return 'already'

  // 2) Saved credentials — the FIRST fallback. They are permanent (the
  //    operator's decision), so a logged-out profile signs in silently.
  const auto = await deps.autoLogin().catch(() => false)
  if (auto) {
    await deps.persistSession().catch(() => {})
    return 'auto'
  }

  // 3) A guest is usable and no window is needed.
  if (deps.guestAllowed) return 'guest'

  // 4) Non-interactive: fail fast instead of hanging on a window nobody sees.
  if (!deps.interactive) throw new LoginRequiredError(deps.provider)

  // 5) No display: the in-TUI form is the accepted fallback — a captcha cannot
  //    be typed in a terminal, but a password/code form still can. Without one
  //    there is nothing to offer, so fail like a non-interactive run.
  if (!deps.canShowWindow) {
    if (deps.tuiLogin) {
      const ok = await deps.tuiLogin().catch(() => false)
      if (ok) {
        await deps.persistSession().catch(() => {})
        return 'tui'
      }
    }
    throw new LoginRequiredError(deps.provider)
  }

  // 6) Open the visible window and wait for the human.
  const inWindow = await runHeadedLogin(deps)
  if (!inWindow) {
    if (deps.isAborted()) throw new LoginCancelledError()
    throw new LoginRequiredError(deps.provider)
  }
  await deps.persistSession().catch(() => {})

  // 7) Back to headless unless the operator asked for a visible window.
  if (!deps.stayHeaded) {
    await deps.relaunch(false).catch(() => {})
    const back = await deps.probeLogin().catch(() => 'unknown' as ProbeResult)
    if (back !== 'in') {
      // The session did not carry over (a session cookie or an SPA token was
      // lost on the relaunch). Stay visible ONCE — never loop.
      await deps.relaunch(true).catch(() => {})
      deps.notice('login.headless_failed')
    }
  }
  await deps.gotoChat().catch(() => {})
  return 'window'
}

/**
 * Show the window, drive the human through the sign-in and return true when
 * the session became active (or the operator closed the window = "done").
 */
async function runHeadedLogin(deps: BrowserLoginDeps): Promise<boolean> {
  if (!deps.stayHeaded) await deps.relaunch(true).catch(() => {})
  await deps.openLoginPage().catch(() => {})
  await deps.prefill().catch(() => {})
  await deps.captureCredentials().catch(() => {})
  deps.notice('login.browser_prompt')

  const deadline = deps.now() + deps.timeoutMs
  while (deps.now() < deadline) {
    if (deps.isAborted()) return false
    const r = await deps.probeLogin().catch(() => 'unknown' as ProbeResult)
    if (r === 'in') return true
    // A closed window is the operator's "I am done" signal. The session may
    // have been established while the page was closing, so probe ONCE more —
    // skipping that probe threw LoginRequiredError on a signed-in operator.
    if (deps.windowClosed()) {
      deps.notice('login.window_closed')
      const again = await deps
        .probeLogin()
        .catch(() => 'unknown' as ProbeResult)
      return again === 'in'
    }
    await deps.sleep(1000)
  }
  deps.notice('login.timeout')
  const last = await deps.probeLogin().catch(() => 'unknown' as ProbeResult)
  return last === 'in'
}

/**
 * PURE: can a browser window be shown? Only a PRELIMINARY filter — WSL2 often
 * exports DISPLAY/WAYLAND_DISPLAY even when WSLg is broken, so the headed
 * launch itself must still be wrapped in try/catch with a timeout.
 */
export function canShowWindow(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): boolean {
  if (env.ZAMES_NONINTERACTIVE_LOGIN === '1') return false
  if (env.CI === 'true' || env.CI === '1') return false
  if (platform === 'win32' || platform === 'darwin') return true
  // Linux/X11/Wayland: a display variable must be set.
  if (env.DISPLAY || env.WAYLAND_DISPLAY) return true
  return false
}

/**
 * PURE: is this run allowed to open an interactive window at all? One-shot
 * (--task), a scheduler job and a non-TTY all say no; the env kill switch
 * ZAMES_NONINTERACTIVE_LOGIN=1 says no too (the smoke scripts set it so a
 * cold login fails fast instead of hanging).
 */
export function loginIsInteractive(opts: {
  isTTY: boolean
  oneShot: boolean
  scheduled: boolean
  env: Record<string, string | undefined>
}): boolean {
  if (opts.env.ZAMES_NONINTERACTIVE_LOGIN === '1') return false
  if (opts.oneShot) return false
  if (opts.scheduled) return false
  return opts.isTTY
}

export type LoginProbeInput = {
  /** The /api/v1/auths/ role, when the page could ask. */
  role?: string | null
  /** A bearer token / session cookie was found in the page storage. */
  hasToken?: boolean
  /** A captcha/verification modal is on the page. */
  captcha?: boolean
  /** A "Sign in" control is visible (a signed-out page shows it). */
  signInVisible?: boolean
}

/**
 * PURE: classify a login state from the cheap signals. The rule that matters
 * is that the INPUT FIELD alone proves nothing: a guest sees it too, so the
 * classifier relies on the API role / a token / an explicit sign-in control.
 */
export function classifyLoginProbe(input: LoginProbeInput): ProbeResult {
  const role = String(input.role || '').toLowerCase()
  if (role === 'user' || role === 'admin') return 'in'
  if (role === 'guest') return input.signInVisible ? 'out' : 'in'
  if (input.captcha) return 'challenge'
  if (input.hasToken === true) return 'in'
  if (input.hasToken === false) return 'out'
  if (input.signInVisible) return 'out'
  return 'unknown'
}
