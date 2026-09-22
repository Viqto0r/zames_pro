import ora, { type Ora } from 'ora'
import { theme } from './theme.js'
import { renderMarkdown } from './markdown.js'
import { translate, type Locale } from './i18n.js'

export interface SpinnerUI {
  thinking: () => void
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

export function createSpinner(locale: Locale = 'ru'): SpinnerUI {
  let spinner: Ora | null = null
  let dotTimer: ReturnType<typeof setInterval> | null = null
  let dotPhase = 0
  let pending: string | null = null

  // Dot animation: start from an empty string (0 dots), then grow.
  // We align the width to the maximum (3) so the hint doesn't shift.
  const DOTS = ['', '.', '..', '...']
  const DOTS_PAD = '   '

  const start = (text: string) => {
    if (!spinner) spinner = ora(text).start()
    else spinner.start(text)
  }

  const stop = () => {
    if (dotTimer) {
      clearInterval(dotTimer)
      dotTimer = null
    }
    if (spinner) spinner.stop()
  }

  // Hint in the status line: while the agent works the terminal is live,
  // so you can type the next message. Without it this is not obvious.
  const HINT = theme.dim('  ·  ' + translate(locale)('spinner.hint'))

  // Start the animated status: brown text + "running" dots.
  const startThinking = () => {
    const base = theme.brown(stripEllipsis(randomThinkingPhrase(locale)))
    // The dots are the same color as the base and of fixed width — otherwise
    // the hint on the right "jumps" when the animation phase changes.
    const dots = (n: number) =>
      theme.brown(DOTS[n] + DOTS_PAD.slice(DOTS[n].length))
    start(base + dots(0) + HINT)
    dotPhase = 0
    if (dotTimer) clearInterval(dotTimer)
    dotTimer = setInterval(() => {
      if (!spinner) return
      dotPhase = (dotPhase + 1) % DOTS.length
      spinner.text = base + dots(dotPhase) + HINT
    }, 400)
    if (dotTimer.unref) dotTimer.unref()
  }

  // Show the typed but not yet sent text instead of the spinner.
  // Lets you type a message right while the agent is working.
  const showPending = () => {
    if (dotTimer) {
      clearInterval(dotTimer)
      dotTimer = null
    }
    if (!spinner) spinner = ora('')
    spinner.start()
    spinner.text = theme.prompt('✎ ') + pending + HINT
  }

  return {
    thinking: () => {
      if (pending) {
        showPending()
        return
      }
      startThinking()
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
      const preview = JSON.stringify(args).slice(0, 120)
      console.log(theme.tool('🔧 ' + name), theme.dim(preview))
    },

    toolResult: (result: unknown) => {
      stop()
      const text = typeof result === 'string' ? result : JSON.stringify(result)
      const preview = text.slice(0, 200).split(String.fromCharCode(10)).join(' ↵ ')
      console.log(theme.toolResult('   → ' + preview + String.fromCharCode(10)))
    },

    assistant: (msg: string) => {
      stop()
      const NL = String.fromCharCode(10)
      const rendered = renderMarkdown(msg)
      // Model answer marker: helps visually separate it from the user's input
      // (which is highlighted by the prompt with a golden arrow).
      console.log(NL + theme.assistant('● Ответ') + NL)
      console.log(rendered)
      console.log(theme.dim('─'.repeat(60)) + NL)
    },

    warning: (msg: string) => {
      stop()
      console.log(String.fromCharCode(10) + theme.warn('⚠ ' + msg))
    },

    stop,
    succeed: () => {},
    fail: () => {},
  }
}
