// Wrapper that renders the Ink LoginForm and resolves with the credentials.
// Mirrors the injected `onLoginPrompt` callback shape so index.ts can wire it
// to the browser without touching browser.ts' login logic.

import React from 'react'
import { render } from 'ink'
import { LoginForm } from './LoginForm.js'
import { TextPrompt } from './TextPrompt.js'
import type { TranslateFn } from '../i18n.js'

export interface LoginPromptResult {
  username: string
  password: string
}

/**
 * Show the Ink login form and resolve with the credentials (or null when the
 * operator cancelled / stdin is not a TTY). Non-TTY resolves null so the
 * caller falls back to its own prompt.
 */
export async function runLoginForm(opts: {
  t: TranslateFn
  initialUsername?: string
  initialPassword?: string
  note?: string
}): Promise<LoginPromptResult | null> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return null
  return await new Promise<LoginPromptResult | null>((resolve) => {
    let done = false
    const app = render(
      <LoginForm
        t={opts.t}
        initialUsername={opts.initialUsername}
        initialPassword={opts.initialPassword}
        note={opts.note}
        onResult={(res) => {
          done = true
          resolve(res)
        }}
      />,
      { exitOnCtrlC: false },
    )
    app.waitUntilExit().then(() => {
      if (!done) resolve(null)
    })
  })
}

/**
 * Show a one-line Ink text prompt (label + input) and resolve with the value,
 * or null on Esc / non-TTY. Used for the MFA code so it stays in the TUI.
 */
export async function runTextPrompt(opts: {
  t: TranslateFn
  label: string
  secret?: boolean
}): Promise<string | null> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return null
  return await new Promise<string | null>((resolve) => {
    let done = false
    const app = render(
      <TextPrompt
        t={opts.t}
        label={opts.label}
        secret={opts.secret}
        onResult={(v) => {
          done = true
          resolve(v)
        }}
      />,
      { exitOnCtrlC: false },
    )
    app.waitUntilExit().then(() => {
      if (!done) resolve(null)
    })
  })
}
