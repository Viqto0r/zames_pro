// Wrapper that renders the Ink AskQuestion modal and resolves with the
// operator's answer. Mirrors run-confirm.tsx / run-select.tsx so index.ts can
// wire it to the AskUser seam without touching the component.

import React from 'react'
import { render } from 'ink'
import { AskQuestion } from './AskQuestion.js'

export interface AskQuestionInkOptions {
  question: string
  options: string[]
  recommended: number | null
  allowText: boolean
}

/**
 * Show the modal question and resolve with the chosen option, the typed text,
 * or null when dismissed / stdin is not a TTY.
 */
export async function askQuestionInk(
  opts: AskQuestionInkOptions,
): Promise<string | null> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return null
  return await new Promise<string | null>((resolve) => {
    let answered = false
    const app = render(
      <AskQuestion
        {...opts}
        onResult={(v) => {
          answered = true
          resolve(v)
        }}
      />,
      { exitOnCtrlC: false },
    )
    app.waitUntilExit().then(() => {
      if (!answered) resolve(null)
    })
  })
}
