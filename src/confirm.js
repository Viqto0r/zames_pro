import * as readlinePromises from 'readline/promises'
import chalk from 'chalk'
import { unifiedDiff, colorDiff } from './diff.js'

export class ConfirmManager {
  constructor({ config }) {
    const c = config || {}
    this.settings = {
      write: c.write !== false,
      edit: c.edit !== false,
      bash: c.bash !== false,
    }
    this.alwaysConfirm = (c.alwaysConfirm || []).map((p) => new RegExp(p, 'i'))
    this.allowedForSession = new Set()
  }

  _matchesAlwaysConfirm(command) {
    return this.alwaysConfirm.some((re) => re.test(command))
  }

  shouldAsk(kind, target = null) {
    if (kind === 'bash' && target && this._matchesAlwaysConfirm(target)) {
      return true
    }
    if (!this.settings[kind]) return false
    if (this.allowedForSession.has(kind)) return false
    return true
  }

  async ask({ kind, target, preview = null, message }) {
    if (!this.shouldAsk(kind, target)) return true

    if (preview) {
      console.log(preview)
    }

    const label = message || `Разрешить ${kind}?`
    const question =
      chalk.yellow(`${label} `) +
      chalk.gray('[') +
      chalk.green('y') +
      chalk.gray(' = да, ') +
      chalk.red('n') +
      chalk.gray(' = нет, ') +
      chalk.cyan('a') +
      chalk.gray(' = всегда для этого типа] ')

    const answer = await this._prompt(question)

    if (answer === 'a') {
      if (kind !== 'bash' || !this._matchesAlwaysConfirm(target)) {
        this.allowedForSession.add(kind)
      }
      return true
    }
    return answer === 'y'
  }

  async _prompt(question) {
    process.stdin.resume()
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false)
    }

    const rl = readlinePromises.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    try {
      const ans = await rl.question(question)
      const v = (ans || '').trim().toLowerCase()
      if (v === 'a' || v === 'always' || v === 'в') return 'a'
      if (v === 'y' || v === 'yes' || v === 'д' || v === 'да') return 'y'
      return 'n'
    } finally {
      rl.close()
    }
  }
}

export function formatDiffPreview(oldText, newText, { label } = {}) {
  const diff = unifiedDiff(oldText, newText, { label })
  return colorDiff(diff, chalk)
}
