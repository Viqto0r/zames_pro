// A TUI LOGIN form (username + masked password) rendered by Ink.
//
// The browser's own interactive login uses readline / askPassword, which
// PAUSES the whole TUI (Ink loses the terminal to readline and both fight for
// stdin). This form keeps the login INSIDE the TUI: the browser calls an
// injected `onLoginPrompt` callback and never touches stdin itself.
//
// It is deliberately simple (two fields, Tab/↑/↓ to switch, Enter to submit,
// Esc to cancel) — a login is a rare, focused step, not a place for menus.

import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { UI, HintBar } from './widgets.js'
import type { TranslateFn } from '../i18n.js'
import { maskSecret, validateLogin } from './login-pure.js'

export interface LoginFormOptions {
  t: TranslateFn
  /** Prefill the username (config may already hold it). */
  initialUsername?: string
  /** Prefill the password (config may already hold it). */
  initialPassword?: string
  /** Shown under the title, e.g. "saved credentials will be reused". */
  note?: string
  onResult: (res: { username: string; password: string } | null) => void
}

/** Mask every character of the password with `*`. */
function mask(s: string): string {
  return maskSecret(s)
}

export function LoginForm({
  t,
  initialUsername = '',
  initialPassword = '',
  note,
  onResult,
}: LoginFormOptions): React.ReactElement {
  const { exit } = useApp()
  const [field, setField] = useState<'user' | 'pass'>(
    initialUsername ? 'pass' : 'user',
  )
  const [user, setUser] = useState(initialUsername)
  const [pass, setPass] = useState(initialPassword)
  const [error, setError] = useState('')

  const finish = (res: { username: string; password: string } | null): void => {
    onResult(res)
    exit()
  }

  const submit = (): void => {
    const v = validateLogin(user, pass)
    if (!v.ok) {
      setError(
        t(v.reason === 'user' ? 'auth.form.need_user' : 'auth.form.need_pass'),
      )
      setField(v.field)
      return
    }
    finish({ username: user.trim(), password: pass })
  }

  const append = (ch: string): void => {
    setError('')
    if (field === 'user') setUser((v) => v + ch)
    else setPass((v) => v + ch)
  }

  const backspace = (): void => {
    setError('')
    if (field === 'user') setUser((v) => Array.from(v).slice(0, -1).join(''))
    else setPass((v) => Array.from(v).slice(0, -1).join(''))
  }

  useInput((input, key) => {
    if (key.escape) {
      finish(null)
      return
    }
    if (key.return) {
      // Enter on the username moves to the password first (so a two-step
      // prompt feels natural); Enter on the password submits.
      if (field === 'user') {
        setField('pass')
        return
      }
      submit()
      return
    }
    if (key.tab || key.upArrow || key.downArrow) {
      setField((f) => (f === 'user' ? 'pass' : 'user'))
      return
    }
    if (key.backspace || key.delete) {
      backspace()
      return
    }
    if (input && input >= ' ') append(input)
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={UI.accent}
      paddingX={2}
    >
      <Text color={UI.title} bold>
        {'🔐 ' + t('auth.form.title')}
      </Text>
      {note ? <Text color={UI.dim}>{note}</Text> : null}
      <Box marginTop={1}>
        <Text color={field === 'user' ? UI.accent : UI.dim}>
          {(field === 'user' ? '❯ ' : '  ') + t('auth.form.login') + ' '}
        </Text>
        <Text color={UI.text}>{user}</Text>
        {field === 'user' ? <Text color={UI.accent}>▏</Text> : null}
      </Box>
      <Box>
        <Text color={field === 'pass' ? UI.accent : UI.dim}>
          {(field === 'pass' ? '❯ ' : '  ') + t('auth.form.password') + ' '}
        </Text>
        <Text color={UI.text}>{mask(pass)}</Text>
        {field === 'pass' ? <Text color={UI.accent}>▏</Text> : null}
      </Box>
      {error ? (
        <Box marginTop={1}>
          <Text color={UI.err}>{'⚠ ' + error}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <HintBar
          hints={[
            ['Tab/↑↓', t('auth.form.hint_field')],
            ['Enter', t('auth.form.hint_submit')],
            ['Esc', t('auth.form.hint_cancel')],
          ]}
        />
      </Box>
    </Box>
  )
}
