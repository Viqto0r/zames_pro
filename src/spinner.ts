import ora, { type Ora } from 'ora'
import { theme, divider } from './theme.js'
import { renderMarkdown } from './markdown.js'
import { translate, type Locale } from './i18n.js'
import { truncateToWidth, wrapToWidth } from './input/layout.js'
import { contentWidth } from './width.js'

export interface SpinnerUI {
  /** Optional task-list badge source ("tasks: 2/5"), like LineEditor. */
  onTasksQuery?: (() => string) | null
  thinking: () => void
  sendPause: (seconds: number) => void
  setPending: (text: string | null) => void
  toolCall: (name: string, args: unknown) => void
  toolResult: (result: unknown) => void
  assistant: (msg: string) => void
  warning: (msg: string) => void
  stop: () => void
  succeed: () => void
  fail: () => void
}

// Phrases for the "agent is working" spinner. Chosen in random order.
// The text comes from i18n via the key 'spinner.phrases' (strings separated by "|").
export function randomThinkingPhrase(locale: Locale = 'ru'): string {
  const raw = translate(locale)('spinner.phrases')
  const phrases = raw.split('|').filter((s) => s.trim().length)
  if (!phrases.length) return ''
  return phrases[Math.floor(Math.random() * phrases.length)]
}

// Strip the trailing ellipsis from the phrase — dots are animated separately.
export function stripEllipsis(phrase: string): string {
  return phrase.replace(/[.…]+\s*$/, '')
}

// Dot animation shared by BOTH UIs (the ora spinner and the LineEditor): start
// from an empty string (0 dots), then grow. The width is padded to the maximum
// (3 dots) so the trailing hint does not "jump" when the phase changes. Kept in
// one place so the two status lines animate identically.
export const DOTS = ['', '.', '..', '...']
export const DOTS_PAD = '   '

// The colored dot string for a phase (brown, matching the base text).
export function renderDots(n: number): string {
  const d = DOTS[n] ?? ''
  return theme.brown(d + DOTS_PAD.slice(d.length))
}

export function createSpinner(locale: Locale = 'ru'): SpinnerUI {
  // Set by the caller (index.ts) to the same todos summary the LineEditor
  // shows, so the non-TTY path has parity.
  let onTasksQuery: (() => string) | null = null
  let spinner: Ora | null = null
  let dotTimer: ReturnType<typeof setInterval> | null = null
  let dotPhase = 0
  let pending: string | null = null
  // Current animated base text and its dot renderer. Kept in variables (not
  // captured in the interval closure) so sendPause() can update the text
  // without restarting the dot animation — otherwise the dots would reset to
  // zero every second and look frozen on a single dot.
  let animBase = ''
  let animating = false
  // When the current animated phase began, so a long reasoning turn can show
  // "12s" / "2m 05s" instead of looking identical to a hung one. Parity with
  // the LineEditor status line (src/input.ts).
  let animStart = 0

  const start = (text: string) => {
    if (!spinner) spinner = ora(text).start()
    else spinner.start(text)
  }

  const stop = () => {
    if (dotTimer) {
      clearInterval(dotTimer)
      dotTimer = null
    }
    animating = false
    if (spinner) spinner.stop()
  }

  // Hint in the status line: while the agent works the terminal is live,
  // so you can type the next message. Without it this is not obvious.
  const HINT = theme.dim('  ·  ' + translate(locale)('spinner.hint'))

  // Run the animated status line: a brown base text plus a growing/shrinking
  // "running" dot sequence. Shared by the thinking spinner and the send-pause
  // indicator, so the pause is animated too (before, it was a static line and
  // the dots did not move — the operator saw a frozen spinner).
  // Elapsed label of the current animated phase ("0s", "45s", "2m 05s").
  // Empty when nothing is animating. Localized units come from the catalog.
  const elapsedLabel = (): string => {
    if (!animating || !animStart) return ''
    const sec = Math.floor((Date.now() - animStart) / 1000)
    const m = Math.floor(sec / 60)
    const s = sec % 60
    const text = m > 0 ? m + 'm ' + String(s).padStart(2, '0') + 's' : s + 's'
    return theme.dim(' · ' + text)
  }

  // Task-list badge, refreshed from onTasksQuery on every animation tick.
  // Mirrors the LineEditor so the non-TTY spinner shows the same "tasks: 2/5".
  const tasksBadge = (): string => {
    if (!onTasksQuery) return ''
    try {
      const s = onTasksQuery()
      return s ? theme.system(s) + ' ' : ''
    } catch {
      return ''
    }
  }

  const startAnimated = (baseText: string) => {
    animBase = theme.brown(stripEllipsis(baseText))
    animStart = Date.now()
    start(animBase + renderDots(0) + elapsedLabel() + tasksBadge() + HINT)
    dotPhase = 0
    if (dotTimer) clearInterval(dotTimer)
    dotTimer = setInterval(() => {
      if (!spinner) return
      dotPhase = (dotPhase + 1) % DOTS.length
      spinner.text =
        animBase + renderDots(dotPhase) + elapsedLabel() + tasksBadge() + HINT
    }, 400)
    animating = true
    if (dotTimer.unref) dotTimer.unref()
  }

  // Start the animated status: brown text + "running" dots.
  const startThinking = () => {
    startAnimated(randomThinkingPhrase(locale))
  }

  // Show the typed but not yet sent text instead of the spinner.
  // Lets you type a message right while the agent is working.
  const showPending = () => {
    if (dotTimer) {
      clearInterval(dotTimer)
      dotTimer = null
    }
    animating = false
    if (!spinner) spinner = ora('')
    spinner.start()
    spinner.text = theme.prompt('✎ ') + pending + HINT
  }

  return {
    get onTasksQuery() {
      return onTasksQuery
    },
    set onTasksQuery(fn: (() => string) | null) {
      onTasksQuery = fn
    },

    thinking: () => {
      if (pending) {
        showPending()
        return
      }
      startThinking()
    },

    // The agent is waiting out the send-interval pause before a real send.
    // Show it as an ANIMATED status line with the remaining seconds, so the
    // spinner keeps moving during the pause (previously a static console line
    // was printed and the dots stayed frozen).
    sendPause: (seconds: number) => {
      if (pending) return
      const label = translate(locale)('spinner.pause', { n: seconds })
      // Update only the base text while the dot animation is already running,
      // so the countdown refreshes without resetting the dots.
      if (animating && dotTimer && spinner) {
        animBase = theme.brown(stripEllipsis(label))
        // Same tail as the timer renders (elapsed + tasks + hint), or the
        // per-second update blinks the elapsed label / task badge away.
        spinner.text =
          animBase + renderDots(dotPhase) + elapsedLabel() + tasksBadge() + HINT
        return
      }
      startAnimated(label)
    },

    // The text the user types while the agent is working.
    // Empty string / null — restore the regular spinner.
    setPending: (text: string | null) => {
      pending = text && String(text).length ? String(text) : null
      if (pending) showPending()
      else startThinking()
    },

    toolCall: (name: string, args: unknown) => {
      stop()
      const maxW = contentWidth()
      const preview = truncateToWidth(JSON.stringify(args), maxW)
      console.log(theme.tool('🔧 ' + name), theme.dim(preview))
      // Keep an animated status while the tool runs (Bash/npm/MCP can take a
      // long time): the operator must see that work is in progress.
      if (pending) return
      startAnimated(translate(locale)('spinner.running_tool', { name }))
    },

    toolResult: (result: unknown) => {
      stop()
      const text = typeof result === 'string' ? result : JSON.stringify(result)
      const maxW = contentWidth()
      const preview = truncateToWidth(
        text.split(String.fromCharCode(10)).join(' ↵ '),
        maxW,
      )
      console.log(theme.toolResult('   → ' + preview + String.fromCharCode(10)))
    },

    assistant: (msg: string) => {
      stop()
      const NL = String.fromCharCode(10)
      const rendered = renderMarkdown(msg)
      // Model answer marker: helps visually separate it from the user's input
      // (which is highlighted by the prompt with a golden arrow).
      console.log(NL + theme.assistant(translate(locale)('editor.answer')) + NL)
      console.log(rendered)
      console.log(theme.dim(divider()) + NL)
    },

    warning: (msg: string) => {
      stop()
      const maxW = contentWidth()
      console.log(
        String.fromCharCode(10) + theme.warn(wrapToWidth('⚠ ' + msg, maxW)),
      )
    },

    stop,
    succeed: () => {},
    fail: () => {},
  }
}
