// Wrapper that shows the Ink ConfirmDialog and resolves with the answer.
// Mirrors the shape of the legacy `askOperatorConfirm` so the caller can swap
// between them.

import React from 'react'
import { render } from 'ink'
import { ConfirmDialog } from './ConfirmDialog.js'
import type { Locale } from '../i18n.js'

export interface AskConfirmOptions {
  title: string
  message?: string
  yesLabel: string
  noLabel: string
  /** Language of the key-hint bar. */
  locale?: Locale
}

/**
 * Show a modal confirm and resolve with the operator's answer. Resolves false
 * when stdin is not a TTY (nothing to prompt on).
 */
export async function askConfirmInk(opts: AskConfirmOptions): Promise<boolean> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return false
  return await new Promise<boolean>((resolve) => {
    let answered = false
    const app = render(
      <ConfirmDialog
        {...opts}
        onAnswer={(ok) => {
          answered = true
          resolve(ok)
        }}
      />,
      { exitOnCtrlC: false },
    )
    app.waitUntilExit().then(() => {
      if (!answered) resolve(false)
    })
  })
}
