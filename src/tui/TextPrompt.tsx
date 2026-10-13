// A one-line Ink TEXT PROMPT (label + single input + Enter/Esc).
//
// Used for steps the browser asks for interactively (currently the DeepSeek
// email one-time code) so they stay INSIDE the TUI instead of falling back to
// promptOnce/readline, which pauses Ink and fights it for stdin.

import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { UI, HintBar } from './widgets.js'
import type { TranslateFn } from '../i18n.js'
import { maskSecret } from './login-pure.js'

export interface TextPromptOptions {
  label: string
  /** Mask the typed characters (a password / one-time code). */
  secret?: boolean
  t: TranslateFn
  onResult: (value: string | null) => void
}

function mask(s: string): string {
  return maskSecret(s)
}

export function TextPrompt({
  label,
  secret,
  t,
  onResult,
}: TextPromptOptions): React.ReactElement {
  const { exit } = useApp()
  const [value, setValue] = useState('')

  const finish = (v: string | null): void => {
    onResult(v)
    exit()
  }

  useInput((input, key) => {
    if (key.escape) {
      finish(null)
      return
    }
    if (key.return) {
      finish(value.trim())
      return
    }
    if (key.backspace || key.delete) {
      setValue((v) => Array.from(v).slice(0, -1).join(''))
      return
    }
    if (input && input >= ' ') setValue((v) => v + input)
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={UI.accent}
      paddingX={2}
    >
      <Text color={UI.text}>{label}</Text>
      <Text color={UI.accent}>
        {'❯ '}
        {secret ? mask(value) : value}
        {'▏'}
      </Text>
      <HintBar
        hints={[
          ['Enter', t('auth.form.hint_submit')],
          ['Esc', t('auth.form.hint_cancel')],
        ]}
      />
    </Box>
  )
}
