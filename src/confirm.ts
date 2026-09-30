import * as readlinePromises from 'readline/promises'
import { theme } from './theme.js'
import { unifiedDiff, colorDiff } from './diff.js'
import { translate, DEFAULT_LOCALE, type Locale } from './i18n.js'

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
  locale: Locale

  constructor({
    config,
    locale = DEFAULT_LOCALE,
  }: { config?: ConfirmConfig; locale?: Locale } = {}) {
    const c = config || {}
    this.locale = locale
    this.settings = {
      write: c.write !== false,
      edit: c.edit !== false,
      bash: c.bash !== false,
    }
    // An invalid operator-supplied regex must NEVER crash the run. Fall back to
    // a literal substring match (case-insensitive) for that pattern.
    this.alwaysConfirm = (c.alwaysConfirm || []).map((p) => {
      try {
        return new RegExp(p, 'i')
      } catch {
        return new RegExp(escapeRegExp(p), 'i')
      }
    })
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

  // Hot-update the language (from /config lang). The manager holds the locale
  // so its prompt follows the interface language without a restart.
  setLocale(locale: Locale): void {
    this.locale = locale
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

    const t = translate(this.locale)
    const label = message || t('confirm.ask_label') + ' ' + kind + '?'
    const question =
      theme.warn(`${label} `) +
      theme.system('[') +
      theme.assistant('y') +
      theme.system(' = ' + t('common.yes') + ', ') +
      theme.error('n') +
      theme.system(' = ' + t('common.no') + ', ') +
      theme.user('a') +
      theme.system(' = ' + t('confirm.hint') + '] ')

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

// Escape a string so it can be used as a literal regex (used when an
// operator-supplied alwaysConfirm pattern is invalid and we fall back to a
// substring match).
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, (m) => '\\' + m)
}

export function formatDiffPreview(
  oldText: string,
  newText: string,
  { label }: { label?: string } = {},
): string {
  const diff = unifiedDiff(oldText, newText, { label })
  return colorDiff(diff)
}
