import ora from 'ora'
import { theme } from './theme.js'

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
      console.log(theme.assistant(String.fromCharCode(10) + '✅ ' + msg) + String.fromCharCode(10))
    },

    taskHeader: (task) => {
      console.log(theme.bold(theme.user(String.fromCharCode(10) + '🎯 Задача: ' + task + String.fromCharCode(10))))
    },

    stop,
    succeed: () => {},
    fail: () => {},
  }
}
