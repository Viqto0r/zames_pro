// N19: the FIRST-RUN WIZARD decision, as a pure state machine.
//
// A new user is dropped straight into DeepSeek with no explanation: which
// language, which provider, why DeepSeek needs a real sign-in while Qwen/GLM
// have guest limits. The wizard is shown ONLY on a truly fresh install (no
// `~/.zames/config.json`), never in a non-TTY / one-shot / non-interactive
// login run, and Esc accepts the defaults.
//
// Only the STEP LOGIC lives here (unit-tested); the Ink widgets (SelectList,
// LoginForm) already exist and are rendered by the caller.

import type { ProviderId } from './providers.js'

export type WizardStep =
  | { kind: 'language' }
  | { kind: 'provider' }
  | { kind: 'login'; provider: ProviderId }
  | { kind: 'done' }

export interface WizardState {
  /** 0-based index of the step in progress. */
  step: number
  locale: 'ru' | 'en' | null
  provider: ProviderId | null
  /** The provider needs a REAL sign-in (no guest fallback for a long run). */
  needsLogin: boolean
}

export function initialWizardState(): WizardState {
  return { step: 0, locale: null, provider: null, needsLogin: false }
}

/**
 * Should the wizard run at all? A fresh HOME only: an existing config means
 * the operator already made these choices, and a non-interactive run (a pipe,
 * `--task`, `ZAMES_NONINTERACTIVE_LOGIN=1`) must never block on a modal.
 */
export function shouldRunWizard(opts: {
  configExists: boolean
  isTTY: boolean
  nonInteractiveLogin: boolean
  oneShot: boolean
}): boolean {
  if (opts.configExists) return false
  if (!opts.isTTY) return false
  if (opts.nonInteractiveLogin) return false
  if (opts.oneShot) return false
  return true
}

/** The step currently shown. */
export function currentStep(s: WizardState): WizardStep {
  if (s.step === 0) return { kind: 'language' }
  if (s.step === 1) return { kind: 'provider' }
  if (s.step === 2 && s.provider && s.needsLogin) {
    return { kind: 'login', provider: s.provider }
  }
  return { kind: 'done' }
}

/** Pick the interface language, then move on. */
export function chooseLanguage(
  s: WizardState,
  locale: 'ru' | 'en' | null,
): WizardState {
  return { ...s, locale, step: 1 }
}

/**
 * Pick a provider. DeepSeek ALWAYS needs a real sign-in; Qwen and GLM can be
 * tried as a guest, but the wizard says honestly that the guest tier is a few
 * turns a day (Qwen) and that GLM gates the first send with a captcha.
 */
export function chooseProvider(
  s: WizardState,
  provider: ProviderId,
): WizardState {
  return {
    ...s,
    provider,
    needsLogin: provider === 'deepseek' || provider === 'glm',
    step: 2,
  }
}

/** The login step finished (or was skipped): the wizard is over. */
export function finishWizard(s: WizardState): WizardState {
  return { ...s, step: 3 }
}

/** Esc at any step accepts the current defaults (never blocks the first run). */
export function acceptDefaults(s: WizardState): WizardState {
  return {
    locale: s.locale ?? 'en',
    provider: s.provider ?? 'deepseek',
    needsLogin: false,
    step: 3,
  }
}

/** One-line honest note per provider, shown under the choice. */
export function providerNote(provider: ProviderId): string {
  if (provider === 'deepseek') {
    return 'DeepSeek needs a real sign-in (a fresh headless login may ask for a captcha in a visible window).'
  }
  if (provider === 'qwen') {
    return 'Qwen works as a guest for a few messages a day; sign in for long tasks.'
  }
  return 'GLM gates the first send with a slider captcha: a visible window (--headed) is the practical mode.'
}
