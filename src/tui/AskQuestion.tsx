// A modal QUESTION with CHOICES for the model's `AskUser` tool.
//
// The operator sees the model's question and a short list of options; one may
// be marked as the model's recommendation and is highlighted. The operator can
// ALWAYS answer in their own words via a last "other" row, so imperfect
// options never block the run. Esc dismisses the question (the model is then
// told to pick a default and continue).
//
// Visual language matches SelectList / ConfirmDialog (rounded border, title,
// hint bar); it is a separate component because the free-text escape needs an
// inline one-line editor, which SelectList does not have.

import React, { useState } from 'react'
import { Box, Text, useInput, useApp, useWindowSize } from 'ink'
import { UI, HintBar } from './widgets.js'
import { translate, type Locale } from '../i18n.js'

export interface AskQuestionOptions {
  question: string
  options: string[]
  /** Index of the recommended option (0-based), or null. */
  recommended: number | null
  /** True when the "other / type my own" row should be shown. */
  allowText: boolean
  locale?: Locale
  onResult: (value: string | null) => void
}

export function AskQuestion({
  question,
  options,
  recommended,
  allowText,
  locale = 'ru',
  onResult,
}: AskQuestionOptions): React.ReactElement {
  const { exit } = useApp()
  const { columns } = useWindowSize()
  const t = translate(locale)
  const innerCols = Math.max(10, (columns || 80) - 6)

  const otherLabel = t('askuser.other')
  const rows = allowText ? [...options, otherLabel] : options
  const [cursor, setCursor] = useState(
    recommended !== null && recommended >= 0 && recommended < options.length
      ? recommended
      : 0,
  )
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')

  const finish = (v: string | null): void => {
    onResult(v)
    exit()
  }

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      finish(null)
      return
    }
    if (typing) {
      if (key.return) {
        const v = text.trim()
        finish(v || null)
        return
      }
      if (key.backspace || key.delete) {
        setText((s) => Array.from(s).slice(0, -1).join(''))
        return
      }
      if (input && input >= ' ') setText((s) => s + input)
      return
    }
    if (key.upArrow || input === 'k') {
      setCursor((c) => (rows.length ? (c - 1 + rows.length) % rows.length : 0))
      return
    }
    if (key.downArrow || input === 'j') {
      setCursor((c) => (rows.length ? (c + 1) % rows.length : 0))
      return
    }
    if (key.return) {
      if (allowText && cursor === options.length) {
        setTyping(true)
        return
      }
      finish(rows[cursor] ?? null)
      return
    }
    // A printable char on the "other" row opens the editor immediately.
    if (allowText && cursor === options.length && input && input >= ' ') {
      setTyping(true)
      setText(input)
    }
  })

  // Word-wrap the question to the inner width (Ink wraps Text too, but a
  // wrapped box row is not counted by the layout, so wrap it here).
  const wrap = (s: string): string[] => {
    const words = String(s).split(/\s+/)
    const out: string[] = []
    let line = ''
    for (const w of words) {
      const cand = line ? line + ' ' + w : w
      if (cand.length > innerCols && line) {
        out.push(line)
        line = w
      } else {
        line = cand
      }
    }
    if (line) out.push(line)
    return out.length ? out : ['']
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={UI.accent}
      paddingX={2}
    >
      <Text color={UI.title} bold>
        {'◆ ' + t('askuser.title')}
      </Text>
      {wrap(question).map((line, i) => (
        <Text key={i} color={UI.text}>
          {line}
        </Text>
      ))}
      <Text color={UI.border}>{'─'.repeat(innerCols)}</Text>
      {typing ? (
        <Box flexDirection="column">
          <Text color={UI.dim}>{t('askuser.your_answer')}</Text>
          <Text color={UI.dim}>{t('askuser.enter_send')}</Text>
          <Text color={UI.accent}>
            {'❯ '}
            {text}
            {'▏'}
          </Text>
        </Box>
      ) : (
        rows.map((label, i) => {
          const sel = i === cursor
          const isRec = i === recommended
          return (
            <Text key={i}>
              <Text color={UI.accent}>{sel ? '❯ ' : '  '}</Text>
              <Text color={sel ? UI.accent : undefined} bold={sel}>
                {label}
              </Text>
              {isRec ? (
                <Text color={UI.on}>
                  {'  (' + t('askuser.recommended') + ')'}
                </Text>
              ) : null}
            </Text>
          )
        })
      )}
      <HintBar
        hints={
          typing
            ? [
                ['Enter', t('askuser.hint_send')],
                ['Esc', t('askuser.hint_cancel')],
              ]
            : [
                ['↑/↓', t('askuser.hint_select')],
                ['Enter', t('askuser.hint_ok')],
                ['Esc', t('askuser.hint_dismiss')],
              ]
        }
      />
    </Box>
  )
}
