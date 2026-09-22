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

// Фразы для спиннера «агент работает». Выбираются в случайном порядке.
// Текст берётся из i18n по ключу 'spinner.phrases' (строки разделены «|»).
export function randomThinkingPhrase(locale: Locale = 'ru'): string {
  const raw = translate(locale)('spinner.phrases')
  const phrases = raw.split('|').filter((s) => s.trim().length)
  if (!phrases.length) return ''
  return phrases[Math.floor(Math.random() * phrases.length)]
}

// Убираем завершающее многоточие из фразы — точки анимируем отдельно.
export function stripEllipsis(phrase: string): string {
  return phrase.replace(/[.…]+\s*$/, '')
}

export function createSpinner(locale: Locale = 'ru'): SpinnerUI {
  let spinner: Ora | null = null
  let dotTimer: ReturnType<typeof setInterval> | null = null
  let dotPhase = 0
  let pending: string | null = null

  // Анимация точек: старт с пустой строки (0 точек), затем рост.
  // Ширину выравниваем по максимуму (3), чтобы подсказка не смещалась.
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

  // Подсказка в строке статуса: во время работы агента терминал живой,
  // можно печатать следующее сообщение. Без неё это неочевидно.
  const HINT = theme.dim('  ·  ' + translate(locale)('spinner.hint'))

  // Запуск анимированного статуса: коричневый текст + «бегущие» точки.
  const startThinking = () => {
    const base = theme.brown(stripEllipsis(randomThinkingPhrase(locale)))
    // Точки того же цвета, что и база, и фиксированной ширины — иначе
    // подсказка справа «прыгает» при смене фазы анимации.
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

  // Показать набранный, но ещё не отправленный текст вместо спиннера.
  // Позволяет печатать сообщение прямо во время работы агента.
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

    // Текст, который пользователь набирает во время работы агента.
    // Пустая строка / null — вернуть обычный спиннер.
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
      // Маркер ответа модели: помогает визуально отделить его от ввода
      // пользователя (который подсвечен приглашением с золотой стрелкой).
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
