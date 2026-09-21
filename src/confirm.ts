import * as readlinePromises from 'readline/promises'
import { theme } from './theme.js'
import { unifiedDiff, colorDiff } from './diff.js'

export interface ConfirmConfig {
  write?: boolean
  edit?: boolean
  bash?: boolean
  alwaysConfirm?: string[]
}

export class ConfirmManager {
  settings: { write: boolean; edit: boolean; bash: boolean }
  alwaysConfirm: RegExp[]
  allowedForSession: Set<string>

  constructor({ config }: { config?: ConfirmConfig } = {}) {
    const c = config || {}
    this.settings = {
      write: c.write !== false,
      edit: c.edit !== false,
      bash: c.bash !== false,
    }
    this.alwaysConfirm = (c.alwaysConfirm || []).map((p) => new RegExp(p, 'i'))
    this.allowedForSession = new Set()
  }

  _matchesAlwaysConfirm(command: string): boolean {
    return this.alwaysConfirm.some((re) => re.test(command))
  }

  shouldAsk(kind: string, target: string | null = null): boolean {
    if (kind === 'bash' && target && this._matchesAlwaysConfirm(target)) {
      return true
    }
    if (!this.settings[kind as keyof typeof this.settings]) return false
    if (this.allowedForSession.has(kind)) return false
    return true
  }

  async ask({
    kind,
    target,
    preview = null,
    message,
  }: {
    kind: string
    target?: string | null
    preview?: string | null
    message?: string
  }): Promise<boolean> {
    if (!this.shouldAsk(kind, target ?? null)) return true

    if (preview) {
      console.log(preview)
    }

    const label = message || `Разрешить ${kind}?`
    const question =
      theme.warn(`${label} `) +
      theme.system('[') +
      theme.assistant('y') +
      theme.system(' = да, ') +
      theme.error('n') +
      theme.system(' = нет, ') +
      theme.user('a') +
      theme.system(' = всегда для этого типа] ')

    const answer = await this._prompt(question)

    if (answer === 'a') {
      if (kind !== 'bash' || !this._matchesAlwaysConfirm(target ?? '')) {
        this.allowedForSession.add(kind)
      }
      return true
    }
    return answer === 'y'
  }

  async _prompt(question: string): Promise<string> {
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

export function formatDiffPreview(
  oldText: string,
  newText: string,
  { label }: { label?: string } = {},
): string {
  const diff = unifiedDiff(oldText, newText, { label })
  return colorDiff(diff)
}
