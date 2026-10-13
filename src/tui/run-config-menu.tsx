// The Ink-based config menu wrapper. Mirrors the `runConfigMenu` signature from
// src/config-menu.ts so index.ts can swap between the two without other changes.
//
// Used when `ui.tui` is enabled; the legacy hand-rolled menu stays available as
// a fallback (and for non-TTY). It renders the Ink `ConfigMenuApp` and resolves
// when the operator quits.

import React from 'react'
import { render } from 'ink'
import { ConfigMenuApp, type ConfigMenuInkOptions } from './ConfigMenu.js'

/**
 * Show the Ink config menu. Returns a promise that resolves when the operator
 * exits (q/Esc/Ctrl+C). Resolves (rather than throwing) when stdin is not a
 * TTY so the caller can fall back to the text list.
 */
export async function runConfigMenuInk(
  opts: Omit<ConfigMenuInkOptions, 'onExit'>,
): Promise<void> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    throw new Error(opts.t('cfg.menu.notty'))
  }
  await new Promise<void>((resolve) => {
    const app = render(
      <ConfigMenuApp
        {...opts}
        onExit={() => {
          resolve()
        }}
      />,
      { exitOnCtrlC: false },
    )
    app.waitUntilExit().then(() => resolve())
  })
}
