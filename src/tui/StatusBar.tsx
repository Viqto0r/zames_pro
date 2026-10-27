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
import { UI } from './ui-colors.js'
import { truncateToWidth, visLen } from '../input/layout.js'
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
 *  status). Measured with the shared `visLen` so wide chars (CJK/emoji) count
 *  as 2 and the emoji's text-presentation selector (\uFE0E) as 0 — a plain
 *  `.length` counted an emoji as 1 and a CJK badge was clipped on a narrow
 *  terminal. Exported so the width arithmetic is unit-tested
 *  without rendering. */
export function badgeTextWidth(state: TuiState): number {
  let w = 0
  if (state.statusLine) w += visLen(state.statusLine) + 1
  if (state.provider) w += visLen('[' + state.provider + '] ')
  if (state.queueLength > 0) w += visLen('⧗' + state.queueLength + ' ')
  if (state.tasks) w += visLen(state.tasks) + 1
  const toggles: string[] = []
  if (state.thinkingEnabled) toggles.push('🧠\uFE0E')
  if (state.searchEnabled) toggles.push('🌐\uFE0E')
  if (toggles.length) w += visLen(toggles.join(' ') + ' ')
  if (state.contextText) {
    const marker =
      state.contextLevel === 'high'
        ? '⛔ '
        : state.contextLevel === 'warn'
          ? '▲ '
          : ''
    w += visLen(marker + state.contextText)
  }
  return w
}

/** The badge row: statusLine, provider, queue, tasks, toggles, context.
 *  `maxWidth` caps the row so it never wraps to a second line; when the badges
 *  do not fit, the lowest-priority ones (statusLine, then provider) are
 *  dropped first so the context counter — the most useful — survives. */
function Badges({
  state,
  budget = Infinity,
}: {
  state: TuiState
  budget?: number
}): React.ReactElement | null {
  // Each badge is (node, visible width); lowest-priority first so the context
  // counter (last) survives when the row is tight.
  const all: Array<{ key: string; w: number; node: React.ReactElement }> = []
  const add = (key: string, w: number, node: React.ReactElement): void => {
    all.push({ key, w, node })
  }
  if (state.statusLine) {
    add(
      'sl',
      visLen(state.statusLine) + 1,
      <Text key="sl" color={UI.system}>
        {state.statusLine}{' '}
      </Text>,
    )
  }
  if (state.provider) {
    add(
      'prov',
      visLen('[' + state.provider + '] '),
      <Text key="prov" color={UI.system}>
        {'[' + state.provider + '] '}
      </Text>,
    )
  }
  if (state.queueLength > 0) {
    add(
      'q',
      visLen('⧗' + state.queueLength + ' '),
      <Text key="q" color={UI.warn}>
        {'⧗' + state.queueLength}{' '}
      </Text>,
    )
  }
  if (state.tasks) {
    add(
      't',
      visLen(state.tasks) + 1,
      <Text key="t" color={UI.system}>
        {state.tasks}{' '}
      </Text>,
    )
  }
  const toggles: string[] = []
  if (state.thinkingEnabled) toggles.push('🧠\uFE0E')
  if (state.searchEnabled) toggles.push('🌐\uFE0E')
  if (toggles.length) {
    const label = toggles.join(' ') + ' '
    add(
      'tg',
      visLen(label),
      <Text key="tg" color={UI.on}>
        {label}
      </Text>,
    )
  }
  if (state.contextText) {
    const color =
      state.contextLevel === 'high'
        ? UI.err
        : state.contextLevel === 'warn'
          ? UI.warn
          : UI.ok
    const marker =
      state.contextLevel === 'high'
        ? '⛔ '
        : state.contextLevel === 'warn'
          ? '▲ '
          : ''
    const label = marker + state.contextText
    add(
      'ctx',
      visLen(label),
      <Text key="ctx" color={color}>
        {label}
      </Text>,
    )
  }
  if (!all.length) return null
  // Drop badges from the FRONT (statusLine, provider, ... least important)
  // until the row fits the budget. Keep at least the last (context).
  let total = all.reduce((n, b) => n + b.w, 0)
  let start = 0
  while (total > budget && start < all.length - 1) {
    total -= all[start].w
    start++
  }
  return <>{all.slice(start).map((b) => b.node)}</>
}

/**
 * The LEFT part of the status row (spinner/pause/scroll marker) as a string.
 * Extracted from the component so the text and its rules are unit-testable
 * without a terminal; the component only truncates and colorizes it.
 */
export function statusLeftText(
  state: TuiState,
  t: ReturnType<typeof translate>,
  frame = 0,
): string {
  const animating = state.busy || !!state.animBase
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
  // It carries NO timer: the elapsed label belongs to an animation, and a
  // counter running next to «scrolled 5 lines» only ate width.
  const scrollNote =
    state.scroll > 0
      ? translate(state.locale)('status.scrolled', { n: String(state.scroll) })
      : ''
  return scrollNote || prefix + left
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
  const leftText = statusLeftText(state, t, frame)
  const showLeft = !!leftText

  // Keep the row on ONE line: the left status may use whatever the BADGES do
  // not need, minus a small gap so the two never touch. A fixed "a third of
  // the width" budget cut the pause counter mid-number («5…») while half the
  // row sat empty; measuring the badges (they are DROPPED whole when the row
  // is tight, the context counter survives longest) is both accurate and
  // keeps the layout stable.
  const cols = useWindowSize().columns || 80
  const badgeW = badgeTextWidth(state)
  const gap = badgeW > 0 ? 2 : 0
  const leftBudget = Math.max(0, cols - 2 - badgeW - gap)
  const leftOut = showLeft ? truncateToWidth(leftText, leftBudget) : ''

  return (
    <Box flexDirection="column">
      {/* A thin divider separates the scrollback log from the live panel. */}
      {divider ? <Text color={UI.border}>{'─'.repeat(cols)}</Text> : null}
      <Box flexDirection="row" width={Math.max(1, cols - 2)} height={1}>
        <Text color={UI.accentDim}>{leftOut || ' '}</Text>
        <Box flexGrow={1} />
        <Badges
          state={state}
          budget={Math.max(0, cols - 2 - visLen(leftOut))}
        />
      </Box>
    </Box>
  )
}
