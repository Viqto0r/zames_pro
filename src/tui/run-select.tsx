// Wrapper that renders an Ink SelectList and resolves with the chosen value.

import React from 'react'
import { render } from 'ink'
import { SelectList, type SelectItem } from './SelectList.js'
import type { Locale } from '../i18n.js'

export async function selectListInk(opts: {
  title: string
  items: SelectItem[]
  initial?: string
  /** Language of the key-hint bar. */
  locale?: Locale
}): Promise<string | null> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return null
  return await new Promise<string | null>((resolve) => {
    let done = false
    const app = render(
      <SelectList
        {...opts}
        onSelect={(v) => {
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
