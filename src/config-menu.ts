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
import { visLen } from './input.js'

export interface ConfigMenuOptions {
  fields: ConfigField[]
  t: TranslateFn
  /** Current field value (may be undefined = default). */
  get: (path: string) => unknown
  /** The default value (for the "modified" marker). Optional. */
  getDefault?: (path: string) => unknown
  /** Save a new value. Throws on a validation error. */
  set: (field: ConfigField, raw: string) => void
  /** Reset to the default. */
  reset: (field: ConfigField) => void
  /** Input/output; defaults to process.stdin/stdout. */
  input?: NodeJS.ReadStream
  output?: NodeJS.WriteStream
}

const ESC = String.fromCharCode(27)

// Strip ANSH sequences to compute the visible length of a line.
function stripAnsi(s: string): string {
  return s.replace(/\x1b\`[0-9;?]*[A-Za-z]/g, '')
}

// Visible COLUMNS of a line (ANSI removed, wide chars counted as 2). Using the
// code-point count made the block height disagree with the real screen on lines
// with emoji/wide chars, so the erase moved to the wrong row and the config list
// duplicated. A row that fills the terminal exactly also triggers autowrap on
// some terminals, so we keep one column free here as the editor does.
function visCols(s: string): number {
  return visLen(stripAnsi(s))
}

function displayValue(
  field: ConfigField,
  value: unknown,
  t: TranslateFn,
): string {
  if (value === undefined) return t('cfg.menu.default')
  if (typeof value === 'boolean')
    return value ? t('common.on') : t('common.off')
  // Never print a password in clear text: show a fixed mask when set.
  if (/password/i.test(field.path) && String(value).length > 0) {
    return '********'
  }
  return String(value)
}

function groupLabel(field: ConfigField, t: TranslateFn): string {
  return theme.system('  ' + t(field.groupKey))
}

/**
 * Show the interactive menu. Returns a promise that resolves when the
 * user exits (q/Esc/Ctrl+C). In a non-TTY it throws — the caller
 * must show a text list.
 */
export function runConfigMenu(opts: ConfigMenuOptions): Promise<void> {
  const input = opts.input || process.stdin
  const output = opts.output || process.stdout
  const { fields, t, get, set, reset, getDefault } = opts

  if (!input.isTTY || !input.setRawMode) {
    return Promise.reject(new Error(t('cfg.menu.notty')))
  }

  // cursor indexes the VISIBLE (filtered) list, not the full `fields`.
  let cursor = 0
  let editing = false
  let editBuf = ''
  // Reverse/forward filter over the list (/ to enter, typing narrows it).
  let filterMode = false
  let filterQuery = ''
  // Second `d` on the same row confirms the reset, so a stray keypress
  // cannot wipe a setting by accident.
  let pendingReset: string | null = null
  let message: string | null = null
  let exited = false
  let resolveDone: (() => void) | null = null

  const wasRaw = input.isRaw
  input.setRawMode(true)
  input.resume()
  output.write(ESC + '[?25l') // hide the cursor while rendering

  // Fields that match the current filter (path, label or group contains the
  // query, case-insensitive). Empty query -> everything.
  const visible = (): ConfigField[] => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return fields
    return fields.filter((f) =>
      (f.path + ' ' + t(f.labelKey || f.path) + ' ' + t(f.groupKey))
        .toLowerCase()
        .includes(q),
    )
  }

  const currentField = (): ConfigField | null => {
    const vis = visible()
    if (!vis.length) return null
    if (cursor >= vis.length) cursor = vis.length - 1
    return vis[cursor]
  }

  // True when the value differs from the default (the field is overridden
  // in a config file), so the menu can mark it. Skipped with no getDefault.
  const isModified = (f: ConfigField): boolean => {
    if (!getDefault) return false
    const cur = get(f.path)
    const def = getDefault(f.path)
    try {
      return JSON.stringify(cur) !== JSON.stringify(def)
    } catch {
      return String(cur) !== String(def)
    }
  }

  // Menu rendering: lines go top to bottom, and we return the cursor to the
  // start of the block via relative moves so we don't spawn blank lines.
  let lastRows = 0
  const render = (): void => {
    const lines: string[] = []
    const vis = visible()
    if (cursor >= vis.length) cursor = Math.max(0, vis.length - 1)
    // Title with a position counter ("Settings — 12/49") so the operator knows
    // how far down a long list they are; a filter narrows both numbers.
    const pos = vis.length ? '  ' + (cursor + 1) + '/' + vis.length : ''
    lines.push(theme.bold(t('cfg.menu.title')) + theme.dim(pos))
    let lastGroup = ''
    for (let i = 0; i < vis.length; i++) {
      const f = vis[i]
      const g = groupLabel(f, t)
      if (g !== lastGroup) {
        lines.push(g)
        lastGroup = g
      }
      const selected = i === cursor
      const marker = selected ? theme.prompt('\u276f ') : '  '
      const label = selected
        ? theme.prompt(f.labelKey ? t(f.labelKey) : f.path)
        : t(f.labelKey || f.path)
      const val = displayValue(f, get(f.path), t)
      const valText = selected ? theme.assistant(val) : theme.dim(val)
      const mod = isModified(f) ? theme.warn('*') : ''
      const pathText = selected ? theme.dim('  ' + f.path) : ''
      lines.push(marker + label + theme.dim('  =  ') + valText + mod + pathText)
    }
    if (!vis.length) {
      lines.push(theme.dim('  ' + t('cfg.menu.no_match')))
    }
    if (editing) {
      lines.push('')
      lines.push(theme.user(t('cfg.menu.edit_hint')))
      lines.push(theme.prompt('\u276f ') + editBuf)
    } else if (filterMode) {
      lines.push('')
      lines.push(theme.user(t('cfg.menu.filter_hint')))
      lines.push(theme.prompt('\u276f ') + filterQuery)
    } else if (message) {
      lines.push('')
      lines.push(theme.assistant(message))
    } else {
      lines.push('')
      if (filterQuery) {
        lines.push(
          theme.dim(
            t('cfg.menu.filter_active', { q: filterQuery }) +
              '  ' +
              t('cfg.menu.hint'),
          ),
        )
      } else {
        lines.push('  ' + theme.dim(t('cfg.menu.hint')))
        lines.push('  ' + theme.dim(t('cfg.menu.filter_hint')))
      }
    }

    // Erase the previous block and print the new one. We count VISUAL lines
    // (accounting for wrapping by terminal width), otherwise on narrow
    // terminals you get "garbage" from unerased tails.
    // Reserve the last column. A line whose visible width reaches exactly the
    // terminal width hits the autowrap edge: depending on the terminal it
    // either consumes two rows for the following `\n` or keeps a pending wrap,
    // and in both cases a full-width divisor UNDERCOUNTS the block height — the
    // erase then misses the tail and the config lines DUPLICATE on screen (the
    // reported bug). Overcounting by one is a harmless blank row; undercounting
    // is not, so we bias to the safe side here.
    const cols = output.columns || 80
    const usable = Math.max(1, cols - 1)
    const rowsOf = (s: string): number => {
      return Math.max(1, Math.ceil(visCols(s) / usable))
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

  // Erase the rendered menu block from the screen. Used on exit so the config
  // list does not stay in the terminal history / scrollback (the operator
  // asked for the menu to disappear after Esc).
  const clearBlock = (): void => {
    if (lastRows > 0) {
      output.write(ESC + '[' + lastRows + 'A')
      for (let i = 0; i < lastRows; i++) {
        output.write(ESC + '[2K' + ESC + '[1B')
      }
      output.write(ESC + '[' + lastRows + 'A')
      lastRows = 0
    }
  }

  const cleanup = (cleanOnExit = false): void => {
    if (exited) return
    exited = true
    input.removeListener('data', onData)
    if (cleanOnExit) clearBlock()
    if (input.setRawMode) input.setRawMode(wasRaw || false)
    output.write(ESC + '[?25h') // restore the cursor
    if (resolveDone) resolveDone()
  }

  const commitEdit = (): void => {
    const f = currentField()
    const raw = editBuf.trim()
    editing = false
    editBuf = ''
    if (!f) return
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
    const f = currentField()
    if (!f) return
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
          // Cancel the edit (do NOT exit the menu) — Esc in the field is
          // "abandon this value", not "close the config".
          editing = false
          editBuf = ''
          break
        }
        if (ch === '\x03') {
          cleanup(true)
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

    // Filter mode (/): printable keys build the query, Esc/Enter leave it
    // (keeping the query active), Ctrl+C exits the whole menu.
    if (filterMode) {
      for (const ch of s) {
        if (ch === '\r' || ch === '\n' || ch === ESC) {
          filterMode = false
          break
        }
        if (ch === '\x03') {
          cleanup(true)
          return
        }
        if (ch === '\x7f' || ch === '\b') {
          filterQuery = filterQuery.slice(0, -1)
        } else if (ch >= ' ') {
          filterQuery += ch
        }
      }
      cursor = 0
      render()
      return
    }

    // The terminal may send several keys in one packet (fast typing,
    // auto-repeat, automation). We parse the buffer into tokens: first
    // escape sequences (arrows), then single characters.
    let i = 0
    while (i < s.length) {
      if (s.startsWith('\x1b[A', i)) {
        const n = visible().length
        if (n > 0) cursor = (cursor - 1 + n) % n
        message = null
        pendingReset = null
        i += 3
        continue
      }
      if (s.startsWith('\x1b[B', i)) {
        const n = visible().length
        if (n > 0) cursor = (cursor + 1) % n
        message = null
        pendingReset = null
        i += 3
        continue
      }
      const ch = s[i]
      if (ch === 'q' || ch === 'Q' || ch === '\x03' || ch === ESC) {
        // Erase the menu block from the screen so the config list does not
        // linger in the terminal history after Esc.
        cleanup(true)
        return
      }
      if (ch === '/') {
        filterMode = true
        message = null
        // The rest of THIS packet belongs to the filter query (typing " /debug"
        // arrives as one chunk, and without this the trailing characters fell
        // through to the command keys — 'd' armed a reset instead of filtering).
        for (const rest of s.slice(i + 1)) {
          if (rest === '\x7f' || rest === '\b') {
            filterQuery = filterQuery.slice(0, -1)
          } else if (rest >= ' ') {
            filterQuery += rest
          }
        }
        cursor = 0
        i = s.length
      } else if (ch === 'k') {
        const n = visible().length
        if (n > 0) cursor = (cursor - 1 + n) % n
        message = null
        pendingReset = null
      } else if (ch === 'j') {
        const n = visible().length
        if (n > 0) cursor = (cursor + 1) % n
        message = null
        pendingReset = null
      } else if (ch === 'g') {
        // Jump to the first field of the NEXT group (and back to the top after
        // the last), so a long grouped list can be navigated quickly.
        const vis = visible()
        if (vis.length) {
          let target = -1
          const curGroup = vis[cursor] ? vis[cursor].groupKey : ''
          for (let k = cursor + 1; k < vis.length; k++) {
            if (vis[k].groupKey !== curGroup) {
              target = k
              break
            }
          }
          cursor = target >= 0 ? target : 0
        }
        message = null
      } else if (ch === '\r' || ch === '\n' || ch === ' ') {
        toggle()
      } else if (ch === 'd' || ch === 'D') {
        const f = currentField()
        if (f) {
          if (pendingReset === f.path) {
            reset(f)
            message = t('cfg.reset', { v: f.path })
            pendingReset = null
          } else {
            pendingReset = f.path
            message = t('cfg.menu.reset_confirm', { v: f.path })
          }
        }
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
