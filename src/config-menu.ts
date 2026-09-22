// Interactive settings menu for the /config command.
//
// The menu renders a list of parameters grouped by sections and lets you
// change them with the arrow keys: boolean/enum toggle in place, number/string
// prompt for input. All strings come from i18n (cfg.*), so the menu is
// fully localized.
//
// The module doesn't know about config.ts directly (except for the schema
// types): the caller reads and writes values through callbacks. This makes the
// menu easy to test and reuse.

import { theme } from './theme.js'
import type { TranslateFn } from './i18n.js'
import type { ConfigField } from './config.js'

export interface ConfigMenuOptions {
  fields: ConfigField[]
  t: TranslateFn
  /** Current field value (may be undefined = default). */
  get: (path: string) => unknown
  /** Save a new value. Throws on a validation error. */
  set: (field: ConfigField, raw: string) => void
  /** Reset to the default. */
  reset: (field: ConfigField) => void
  /** Input/output; defaults to process.stdin/stdout. */
  input?: NodeJS.ReadStream
  output?: NodeJS.WriteStream
}

const ESC = String.fromCharCode(27)

// Strip ANSI sequences to compute the visible length of a line.
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
}

function displayValue(
  field: ConfigField,
  value: unknown,
  t: TranslateFn,
): string {
  if (value === undefined) return t('cfg.menu.default')
  if (typeof value === 'boolean') return value ? t('common.on') : t('common.off')
  return String(value)
}

function groupLabel(field: ConfigField, t: TranslateFn): string {
  return t(field.groupKey)
}

/**
 * Show the interactive menu. Returns a promise that resolves when the
 * user exits (q/Esc/Ctrl+C). In a non-TTY it throws — the caller
 * must show a text list.
 */
export function runConfigMenu(opts: ConfigMenuOptions): Promise<void> {
  const input = opts.input || process.stdin
  const output = opts.output || process.stdout
  const { fields, t, get, set, reset } = opts

  if (!input.isTTY || !input.setRawMode) {
    return Promise.reject(new Error(t('cfg.menu.notty')))
  }

  let cursor = 0
  let editing = false
  let editBuf = ''
  let message: string | null = null
  let exited = false
  let resolveDone: (() => void) | null = null

  const wasRaw = input.isRaw
  input.setRawMode(true)
  input.resume()
  output.write(ESC + '[?25l') // hide the cursor while rendering

  // Menu rendering: lines go top to bottom, and we return the cursor to the
  // start of the block via relative moves so we don't spawn blank lines.
  let lastRows = 0
  const render = (): void => {
    const lines: string[] = []
    lines.push(theme.bold(t('cfg.menu.title')))
    let lastGroup = ''
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]
      const g = groupLabel(f, t)
      if (g !== lastGroup) {
        lines.push(theme.system('  ' + g))
        lastGroup = g
      }
      const selected = i === cursor
      const marker = selected ? theme.prompt('\u276f ') : '  '
      const label = selected ? theme.prompt(f.labelKey ? t(f.labelKey) : f.path) : t(f.labelKey || f.path)
      const val = displayValue(f, get(f.path), t)
      const valText = selected ? theme.assistant(val) : theme.dim(val)
      const pathText = selected ? theme.dim('  ' + f.path) : ''
      lines.push(marker + label + theme.dim('  =  ') + valText + pathText)
    }
    if (editing) {
      lines.push('')
      lines.push(theme.user(t('cfg.menu.edit_hint')))
      lines.push(theme.prompt('\u276f ') + editBuf)
    } else if (message) {
      lines.push('')
      lines.push(theme.assistant(message))
    } else {
      lines.push('')
      lines.push(theme.dim(t('cfg.menu.hint')))
    }

    // Erase the previous block and print the new one. We count VISUAL lines
    // (accounting for wrapping by terminal width), otherwise on narrow
    // terminals you get "garbage" from unerased tails.
    const cols = output.columns || 80
    const rowsOf = (s: string): number => {
      const len = stripAnsi(s).length
      return Math.max(1, Math.ceil(len / Math.max(1, cols)))
    }
    if (lastRows > 0) {
      output.write(ESC + '[' + lastRows + 'A')
      for (let i = 0; i < lastRows; i++) {
        output.write(ESC + '[2K' + ESC + '[1B')
      }
      output.write(ESC + '[' + lastRows + 'A')
    }
    output.write(lines.join('\n') + '\n')
    lastRows = lines.reduce((n, l) => n + rowsOf(l), 0)
  }

  const cleanup = (): void => {
    if (exited) return
    exited = true
    input.removeListener('data', onData)
    if (input.setRawMode) input.setRawMode(wasRaw || false)
    output.write(ESC + '[?25h') // restore the cursor
    if (resolveDone) resolveDone()
  }

  const commitEdit = (): void => {
    const f = fields[cursor]
    const raw = editBuf.trim()
    editing = false
    editBuf = ''
    if (!raw) {
      message = null
      return
    }
    try {
      set(f, raw)
      message = t('cfg.menu.saved', {
        v: f.path,
        value: displayValue(f, get(f.path), t),
      })
    } catch (e) {
      message = String((e as Error).message || e)
    }
  }

  const toggle = (): void => {
    const f = fields[cursor]
    if (f.type === 'boolean') {
      const cur = get(f.path)
      set(f, cur === true ? 'false' : 'true')
      message = null
      return
    }
    if (f.type === 'enum' && f.values && f.values.length) {
      const cur = String(get(f.path) ?? '')
      const idx = f.values.indexOf(cur)
      const next = f.values[(idx + 1) % f.values.length]
      set(f, next)
      message = null
      return
    }
    // number/string — prompt for input.
    editing = true
    editBuf = get(f.path) === undefined ? '' : String(get(f.path))
  }

  const onData = (buf: Buffer): void => {
    const s = buf.toString('utf-8')
    if (editing) {
      // Process input character by character: the terminal may send several
      // bytes at once (paste, auto-repeat), Enter is 0x0d/0x0a, backspace is 0x7f.
      for (const ch of s) {
        if (ch === '\r' || ch === '\n') {
          commitEdit()
          break
        }
        if (ch === ESC) {
          editing = false
          editBuf = ''
          break
        }
        if (ch === '\x03') {
          cleanup()
          output.write('\n')
          return
        }
        if (ch === '\x7f' || ch === '\b') {
          editBuf = editBuf.slice(0, -1)
        } else if (ch >= ' ') {
          editBuf += ch
        }
      }
      render()
      return
    }

    // The terminal may send several keys in one packet (fast typing,
    // auto-repeat, automation). We parse the buffer into tokens: first
    // escape sequences (arrows), then single characters.
    let i = 0
    while (i < s.length) {
      if (s.startsWith('\x1b[A', i)) {
        cursor = (cursor - 1 + fields.length) % fields.length
        message = null
        i += 3
        continue
      }
      if (s.startsWith('\x1b[B', i)) {
        cursor = (cursor + 1) % fields.length
        message = null
        i += 3
        continue
      }
      const ch = s[i]
      if (ch === 'q' || ch === 'Q' || ch === '\x03' || ch === ESC) {
        cleanup()
        output.write('\n')
        return
      }
      if (ch === 'k') {
        cursor = (cursor - 1 + fields.length) % fields.length
        message = null
      } else if (ch === 'j') {
        cursor = (cursor + 1) % fields.length
        message = null
      } else if (ch === '\r' || ch === '\n' || ch === ' ') {
        toggle()
      } else if (ch === 'd' || ch === 'D') {
        const f = fields[cursor]
        reset(f)
        message = t('cfg.reset', { v: f.path })
      }
      i++
    }
    render()
  }

  return new Promise<void>((resolve) => {
    resolveDone = resolve
    input.on('data', onData)
    render()
  })
}
