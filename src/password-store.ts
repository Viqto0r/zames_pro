// N21: WHERE a provider password is stored.
//
// Today `browser.auth.password` sits in `~/.zames/config.json` as plain text
// (the file is 0600, which is not encryption). This module owns the DECISION —
// a pure function, so the choice is testable without touching a keychain:
//
//  - `none`      — do not store the password at all; the session lives in the
//                  browser profile and the password is asked for only when that
//                  session is gone.
//  - `keychain`  — an external OS tool (`secret-tool` on Linux Secret Service,
//                  `security` on macOS, PowerShell Credential Manager on
//                  Windows). No native npm dependency.
//  - `config`    — the historical plain-text field (the fallback).
//
// The MIGRATION is explicit: an existing plain password is moved to the chosen
// store and the config field is cleared, never silently duplicated.

export type PasswordStore = 'none' | 'keychain' | 'config'

export interface StoreProbe {
  /** Which external tools were FOUND on this machine. */
  secretTool: boolean
  security: boolean
  powershell: boolean
  platform: 'linux' | 'darwin' | 'win32' | 'other'
}

/**
 * The store that can actually be used right now. `preferred` comes from the
 * operator (`browser.passwordStore`); when it is `keychain` but no tool exists,
 * the caller falls back to `config` WITH a warning — the password must never
 * be silently dropped.
 */
export function resolvePasswordStore(
  preferred: PasswordStore,
  probe: StoreProbe,
): { store: PasswordStore; degraded: boolean } {
  if (preferred !== 'keychain') return { store: preferred, degraded: false }
  const available =
    (probe.platform === 'linux' && probe.secretTool) ||
    (probe.platform === 'darwin' && probe.security) ||
    (probe.platform === 'win32' && probe.powershell)
  if (available) return { store: 'keychain', degraded: false }
  return { store: 'config', degraded: true }
}

/**
 * The migration plan for an EXISTING plain-text password. `null` password =
 * nothing to migrate. A `none` store simply drops it (the operator asked for
 * that); `config` keeps it as is; `keychain` moves it and clears the field.
 */
export interface MigrationPlan {
  /** Write the secret to the keychain under this account name. */
  keychainWrite: string | null
  /** Clear `browser.auth.password` in the config file. */
  clearConfig: boolean
  /** True when the operator must be warned (a degraded store). */
  warn: boolean
}

export function planPasswordMigration(
  existing: string | null,
  store: PasswordStore,
  degraded: boolean,
): MigrationPlan {
  const has = !!(existing && existing.trim())
  if (!has) return { keychainWrite: null, clearConfig: false, warn: degraded }
  if (store === 'none') {
    return { keychainWrite: null, clearConfig: true, warn: degraded }
  }
  if (store === 'keychain') {
    return { keychainWrite: existing, clearConfig: true, warn: degraded }
  }
  return { keychainWrite: null, clearConfig: false, warn: degraded }
}

/** The account name used inside the OS store (one entry per provider). */
export function keychainAccount(provider: string): string {
  return 'zames:' + provider
}
