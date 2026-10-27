// Wrapper that renders the Ink ThemePicker and resolves with the chosen palette
// id (or null when the operator cancels). The caller applies the previews and
// restores the previous palette on cancel.

import React from 'react'
import { render } from 'ink'
import { ThemePicker } from './ThemePicker.js'
import type { Locale } from '../i18n.js'

export async function pickThemeInk(opts: {
  themes: string[]
  initial: string
  onPreview: (name: string) => void
  locale?: Locale
}): Promise<string | null> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return null
  return await new Promise<string | null>((resolve) => {
    let done = false
    const app = render(
      <ThemePicker
        {...opts}
        onDone={(v) => {
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
