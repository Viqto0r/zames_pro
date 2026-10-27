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
import { UI, type UiColors } from './ui-colors.js'
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
  // The scrolled-up marker carries NO timer: the elapsed label belongs to an
  // animation, and a counter running next to «scrolled 5 lines» only ate width.
  const scrollNote =
    state.scroll > 0
      ? translate(state.locale)('status.scrolled', { n: String(state.scroll) })
      : ''
  return scrollNote || prefix + left
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

/** One badge: its key (for priority/width math), the painted label and the
 *  PALETTE ROLE it uses. Exported so the derivation is unit-tested. */
export interface Badge {
  key: 'sl' | 'prov' | 'q' | 't' | 'tg' | 'ctx'
  label: string
  /** Palette role (a UI.* key) the badge is painted with. */
  role: keyof UiColors
}

/**
 * The badges to show, in priority order (the LAST survives a narrow terminal).
 * The badge row is what tells the operator WHAT is on — provider, queue, the
 * task counter, the toggles and the context fill — so it is derived here, once,
 * with a palette role each, instead of being hardcoded in the component. The
 * task counter used to be painted with the generic `system` gray, which is why
 * it looked "not themed" next to the provider.
 */
export function statusBadges(state: TuiState): Badge[] {
  const out: Badge[] = []
  if (state.statusLine) {
    out.push({ key: 'sl', label: state.statusLine + ' ', role: 'dim' })
  }
  if (state.provider) {
    out.push({
      key: 'prov',
      label: '[' + state.provider + '] ',
      role: 'system',
    })
  }
  if (state.queueLength > 0) {
    out.push({ key: 'q', label: '⧗' + state.queueLength + ' ', role: 'warn' })
  }
  if (state.tasks) {
    // The task counter is the MODEL's todo progress: paint it with the same
    // role the per-task summary line uses, so it reads as agent activity, not
    // as the generic service gray it had before.
    out.push({ key: 't', label: state.tasks + ' ', role: 'title' })
  }
  const toggles: string[] = []
  if (state.thinkingEnabled) toggles.push('🧠︎')
  if (state.searchEnabled) toggles.push('🌐︎')
  if (toggles.length) {
    out.push({ key: 'tg', label: toggles.join(' ') + ' ', role: 'on' })
  }
  if (state.contextText) {
    const role: keyof UiColors =
      state.contextLevel === 'high'
        ? 'err'
        : state.contextLevel === 'warn'
          ? 'warn'
          : 'ok'
    const marker =
      state.contextLevel === 'high'
        ? '⛔ '
        : state.contextLevel === 'warn'
          ? '▲ '
          : ''
    out.push({ key: 'ctx', label: marker + state.contextText, role })
  }
  return out
}

/** The badge row. `budget` caps the row so it never wraps to a second line;
 *  when the badges do not fit, the lowest-priority ones (statusLine, then
 *  provider) are dropped first so the context counter survives. */
function Badges({
  state,
  budget = Infinity,
}: {
  state: TuiState
  budget?: number
}): React.ReactElement | null {
  const all = statusBadges(state)
  if (!all.length) return null
  let total = all.reduce((n, b) => n + visLen(b.label), 0)
  let start = 0
  while (total > budget && start < all.length - 1) {
    total -= visLen(all[start].label)
    start++
  }
  return (
    <>
      {all.slice(start).map((b) => (
        <Text key={b.key} color={UI[b.role]}>
          {b.label}
        </Text>
      ))}
    </>
  )
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
