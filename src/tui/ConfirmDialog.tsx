// A reusable Ink CONFIRM dialog (y/N) — a small modal box with two buttons
// navigated by ←/→ (or y/n) and confirmed with Enter. Replaces the raw
// `promptOnce('... [y/N] ')` that paused the whole TUI.

import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { UI, HintBar } from './widgets.js'
import { translate, type Locale } from '../i18n.js'

export interface ConfirmOptions {
  title: string
  message?: string
  /** Label of the affirmative button (default localized by the caller). */
  yesLabel: string
  noLabel: string
  /** Resolve with the operator's answer. */
  onAnswer: (ok: boolean) => void
  /** Language of the key-hint bar (operator text goes through i18n). */
  locale?: Locale
}

function Button({
  label,
  focused,
  danger,
}: {
  label: string
  focused: boolean
  danger?: boolean
}): React.ReactElement {
  const color = danger ? UI.err : UI.on
  return (
    <Text>
      {focused ? <Text color={color}>{'▸ '}</Text> : <Text>{'  '}</Text>}
      <Text color={focused ? color : UI.dim} bold={focused}>
        {label}
      </Text>
    </Text>
  )
}

export function ConfirmDialog({
  title,
  message,
  yesLabel,
  noLabel,
  onAnswer,
  locale = 'en',
}: ConfirmOptions): React.ReactElement {
  // Focus starts on "no" — a stray Enter must not confirm a destructive action.
  const [yes, setYes] = useState(false)
  const { exit } = useApp()
  const t = translate(locale)

  const answer = (ok: boolean): void => {
    onAnswer(ok)
    exit()
  }

  useInput((input, key) => {
    if (key.escape || input === 'n' || input === 'N' || input === 'т') {
      answer(false)
      return
    }
    if (input === 'y' || input === 'Y' || input === 'д' || input === 'Д') {
      answer(true)
      return
    }
    if (key.leftArrow || key.rightArrow || key.tab) {
      setYes((v) => !v)
      return
    }
    if (key.return) {
      answer(yes)
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={UI.warn}
      paddingX={2}
      paddingY={0}
    >
      <Text color={UI.warn} bold>
        {'⚠ ' + title}
      </Text>
      {message ? <Text color={UI.text}>{message}</Text> : null}
      <Box marginTop={1}>
        <Button label={yesLabel} focused={yes} danger />
        <Text>{'    '}</Text>
        <Button label={noLabel} focused={!yes} />
      </Box>
      <HintBar
        hints={[
          ['←/→', t('tui.hint.select')],
          ['Enter', t('tui.hint.ok')],
          ['y/n', ''],
        ]}
      />
    </Box>
  )
}
