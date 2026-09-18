import ora from 'ora'
import { theme } from './theme.js'
import { renderMarkdown } from './markdown.js'

export function createSpinner() {
  let spinner = null

  const start = (text) => {
    if (!spinner) spinner = ora(text).start()
    else spinner.start(text)
  }

  const stop = () => {
    if (spinner) spinner.stop()
  }

  return {
    thinking: () => start(theme.system('Думаю...')),

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
