import ora from 'ora'
import { theme } from './theme.js'
import { renderMarkdown } from './markdown.js'

// Фразы для спиннера «агент работает». Выбираются в случайном порядке.
const THINKING_PHRASES = [
  'Замешиваю кал…',
  'Взбиваю кал до однородной массы…',
  'Мешаю кал с логикой…',
  'Взбалтываю кал в коктейль…',
  'Кручу венчиком по калу…',
  'Смешиваю кал с кофеином…',
  'Замешиваю тесто из кала…',
  'Взбиваю пену из кала…',
  'Перемешиваю кал лопатой…',
  'Замешиваю глину из кала…',
  'Гомогенизирую кал до состояния бетона…',
  'Взбалтываю кал до просветления…',
  'Блендерю кал в смузи…',
  'Замешиваю цемент из кала…',
  'Взбиваю кашу из кала…',
  'Мешаю кал с надеждой…',
  'Взбалтываю осадок из кала…',
  'Кручу блендером по калу…',
  'Смешиваю кал до неразличимости…',
  'Замешиваю раствор из кала…',
  'Взбиваю коктейль «кал»…',
  'Перемешиваю кал лопатой дедлайна…',
  'Замешиваю кашу из кала…',
  'Взбиваю пенку из кала…',
  'Гомогенизирую кал до однородности…',
  'Взбалтываю кал в бетономешалке…',
  'Замешиваю кал в тесто…',
  'Сбиваю кал в однородную массу…',
  'Размешиваю кал до просветления…',
  'Замешиваю кал из всего подряд…',
]

export function randomThinkingPhrase() {
  return THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]
}

// Убираем завершающее многоточие из фразы — точки анимируем отдельно.
export function stripEllipsis(phrase) {
  return phrase.replace(/[.…]+\s*$/, '')
}

export function createSpinner() {
  let spinner = null
  let dotTimer = null
  let dotPhase = 0
  let pending = null

  const DOTS = ['.', '..', '...']

  const start = (text) => {
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
  const HINT = theme.dim('  ·  печатай — Enter в очередь, Esc стоп')

  // Запуск анимированного статуса: коричневый текст + «бегущие» точки.
  const startThinking = () => {
    const base = theme.brown(stripEllipsis(randomThinkingPhrase()))
    start(base + DOTS[0] + HINT)
    dotPhase = 0
    if (dotTimer) clearInterval(dotTimer)
    dotTimer = setInterval(() => {
      if (!spinner) return
      dotPhase = (dotPhase + 1) % DOTS.length
      spinner.text = base + DOTS[dotPhase] + HINT
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
    setPending: (text) => {
      pending = text && String(text).length ? String(text) : null
      if (pending) showPending()
      else startThinking()
    },

    toolCall: (name, args) => {
      stop()
      const preview = JSON.stringify(args).slice(0, 120)
      console.log(theme.tool('🔧 ' + name), theme.dim(preview))
    },

    toolResult: (result) => {
      stop()
      const text = typeof result === 'string' ? result : JSON.stringify(result)
      const preview = text.slice(0, 200).split(String.fromCharCode(10)).join(' ↵ ')
      console.log(theme.toolResult('   → ' + preview + String.fromCharCode(10)))
    },

    assistant: (msg) => {
      stop()
      const NL = String.fromCharCode(10)
      const rendered = renderMarkdown(msg)
      // Маркер ответа модели: помогает визуально отделить его от ввода
      // пользователя (который подсвечен приглашением с золотой стрелкой).
      console.log(NL + theme.assistant('● Ответ') + NL)
      console.log(rendered)
      console.log(theme.dim('─'.repeat(60)) + NL)
    },

    stop,
    succeed: () => {},
    fail: () => {},
  }
}
