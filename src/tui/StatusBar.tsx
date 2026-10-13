// The live STATUS BAR above the input line: an animated spinner (or the typed
// pending text), a lifecycle prefix (generating/settled), an elapsed timer,
// and a right-aligned row of badges — provider, queue, tasks, toggle icons and
// the context counter.
//
// All text is localized; the badge ORDER matches the old LineEditor status so
// the operator sees the same information, only laid out by Ink instead of by
// hand.

import React from 'react'
import { Box, Text, useAnimation, useWindowSize } from 'ink'
import { translate, type Locale } from '../i18n.js'
import { DOTS, stripEllipsis } from '../spinner.js'
import { truncateToWidth } from '../input/layout.js'
import { parseTaskProgress, renderProgressBar } from './progress.js'
import type { TuiState } from './store.js'

/** Elapsed seconds of the current animated phase ("0s", "45s", "2m 05s"). */
function elapsedLabel(startedAt: number, animating: boolean): string {
  if (!animating || !startedAt) return ''
  const sec = Math.floor((Date.now() - startedAt) / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  const text = m > 0 ? m + 'm ' + String(s).padStart(2, '0') + 's' : s + 's'
  return ' · ' + text
}

/** Lifecycle prefix, colored by meaning (generating / settled). */
function stateLabel(state: TuiState, locale: Locale): string {
  if (state.sendState === 'generating') {
    return translate(locale)('state.generating') + ':'
  }
  if (state.sendState === 'settled') {
    return translate(locale)('state.settled') + ':'
  }
  return ''
}

/** Visible width of the badge row (used to reserve space for the left
 *  status). An emoji is counted as 2 columns; the rest as 1. Approximation is
 *  fine — the goal is only to avoid clipping the badges. */
function badgeTextWidth(state: TuiState): number {
  let w = 0
  if (state.statusLine) w += state.statusLine.length + 1
  if (state.provider) w += state.provider.length + 3
  if (state.queueLength > 0) w += 2 + String(state.queueLength).length
  if (state.codeBlocks.length > 0) w += 8
  if (state.tasks) w += state.tasks.length + 7
  if (state.thinkingEnabled) w += 3
  if (state.searchEnabled) w += 3
  if (state.contextText) {
    const marker =
      state.contextLevel === 'high' ? 2 : state.contextLevel === 'warn' ? 2 : 0
    w += state.contextText.length + marker
  }
  return w
}

/** The badge row: statusLine, provider, queue, tasks, toggles, context. */
function Badges({ state }: { state: TuiState }): React.ReactElement | null {
  const parts: React.ReactElement[] = []
  if (state.statusLine) {
    parts.push(
      <Text key="sl" color="#808896">
        {state.statusLine}{' '}
      </Text>,
    )
  }
  if (state.provider) {
    parts.push(
      <Text key="prov" color="#808896">
        {'[' + state.provider + '] '}
      </Text>,
    )
  }
  if (state.queueLength > 0) {
    parts.push(
      <Text key="q" color="#c9a86a">
        {'⧗' + state.queueLength}{' '}
      </Text>,
    )
  }
  if (state.codeBlocks.length > 0) {
    // A hint that the last answer has copyable code: Ctrl+Y copies the last
    // block (or the focused one), like a copy button in a GUI chat.
    const idx = state.codeFocus >= 0 ? state.codeFocus + 1 : state.codeBlocks.length
    parts.push(
      <Text key="code" color="#7fc4f0">
        {'⌘ ' + idx + '/' + state.codeBlocks.length + ' '}
      </Text>,
    )
  }
  if (state.tasks) {
    const prog = parseTaskProgress(state.tasks)
    const bar = renderProgressBar(prog, 5)
    parts.push(
      <Text key="t" color="#808896">
        {bar ? bar + ' ' : ''}
        {state.tasks}{' '}
      </Text>,
    )
  }
  const toggles: string[] = []
  if (state.thinkingEnabled) toggles.push('🧠\uFE0E')
  if (state.searchEnabled) toggles.push('🌐\uFE0E')
  if (toggles.length) {
    parts.push(
      <Text key="tg" color="#6fd0b0">
        {toggles.join(' ') + ' '}
      </Text>,
    )
  }
  if (state.contextText) {
    const color =
      state.contextLevel === 'high'
        ? '#c98a80'
        : state.contextLevel === 'warn'
          ? '#c9a86a'
          : '#a9c08c'
    const marker =
      state.contextLevel === 'high'
        ? '⛔ '
        : state.contextLevel === 'warn'
          ? '▲ '
          : ''
    parts.push(
      <Text key="ctx" color={color}>
        {marker + state.contextText}
      </Text>,
    )
  }
  if (!parts.length) return null
  return <Box>{parts}</Box>
}

export function StatusBar({
  state,
  divider = true,
}: {
  state: TuiState
  /** Draw the thin rule above the status. Off in full-screen mode, which has
   *  its own header divider (otherwise the rule shows twice). */
  divider?: boolean
}): React.ReactElement {
  // Drive the spinner from Ink's shared animation timer (one timer for the
  // whole tree). The interval matches the old 400ms dot cadence.
  const animating = state.busy || !!state.animBase
  const { frame } = useAnimation({ interval: 400, isActive: animating })

  const t = translate(state.locale)
  const stateLbl = stateLabel(state, state.locale)

  let left: string
  if (state.pendingText) {
    left = '✎ ' + state.pendingText + '  ·  ' + t('spinner.hint')
  } else if (state.animBase) {
    const dots = DOTS[frame % DOTS.length] ?? ''
    const pad = '   '.slice(dots.length)
    left =
      stripEllipsis(state.animBase) +
      dots +
      pad +
      elapsedLabel(state.animStart, animating) +
      '  ·  ' +
      t('spinner.hint')
  } else if (state.statusText) {
    left = state.statusText
  } else {
    left = ''
  }

  const prefix = stateLbl ? stateLbl + ' ' : ''
  // When the log is scrolled up, show a marker in the status line (NOT as a
  // separate row below the input — that pushed the panel up and made the input
  // jump). It replaces the spinner text while scrolled, so it never adds a row.
  const scrollNote =
    state.scroll > 0 ? `↑ прокручено на ${state.scroll} стр. · PgDn/End` : ''
  const leftText = scrollNote || prefix + left
  const showLeft = !!leftText

  // Keep the badge row visible: the left status truncates to whatever space is
  // left after the badges, instead of pushing them off the right edge (they
  // used to be clipped: "[DeepSee⧗1 задачи: 3/...").
  const cols = useWindowSize().columns || 80
  const badgeWidth = badgeTextWidth(state)
  const maxLeft = Math.max(0, cols - badgeWidth - 2)
  const leftOut = showLeft ? truncateToWidth(leftText, maxLeft) : ''

  return (
    <Box flexDirection="column">
      {/* A thin divider separates the scrollback log from the live panel, so
          the operator can see where the fixed bottom area begins. */}
      {divider ? <Text color="#3a3f4b">{'─'.repeat(cols)}</Text> : null}
      <Box justifyContent="space-between">
        <Box>
          {leftOut ? <Text color="#a1723f">{leftOut}</Text> : <Text> </Text>}
        </Box>
        <Badges state={state} />
      </Box>
    </Box>
  )
}
