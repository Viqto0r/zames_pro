import ora from 'ora'
import chalk from 'chalk'

export function createSpinner() {
  let spinner = null

  const start = (text) => {
    if (!spinner) spinner = ora(text).start()
    else spinner.start(text)
  }

  const stop = () => {
    if (spinner) spinner.stop()
  }

  const succeed = (text) => {
    if (spinner) spinner.succeed(text)
  }

  const fail = (text) => {
    if (spinner) spinner.fail(text)
  }

  return {
    // Единственный метод, который ЗАПУСКАЕТ спиннер
    thinking: () => start(chalk.gray('Думаю...')),

    // Оба метода только останавливают и печатают — не перезапускают
    toolCall: (name, args) => {
      stop()
      const preview = JSON.stringify(args).slice(0, 120)
      console.log(chalk.yellow(`🔧 ${name}`), chalk.gray(preview))
    },

    toolResult: (result) => {
      stop()
      const text = typeof result === 'string' ? result : JSON.stringify(result)
      const preview = text.slice(0, 200).replace(/\n/g, ' ↵ ')
      console.log(chalk.gray(`   → ${preview}\n`))
    },

    assistant: (msg) => {
      stop()
      console.log(chalk.green('\n✅ ' + msg) + '\n')
    },

    taskHeader: (task) => {
      console.log(chalk.bold.cyan(`\n🎯 Задача: ${task}\n`))
    },

    stop,
    succeed,
    fail,
  }
}
