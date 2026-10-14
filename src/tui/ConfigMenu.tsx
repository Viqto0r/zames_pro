// The Ink-based CONFIG MENU — a drop-in alternative to the hand-rolled
// `runConfigMenu` (src/config-menu.ts), used when `ui.tui` is enabled.
//
// It offers the same operations with a cleaner layout: a scrolling list of
// settings grouped by section, ↑/↓ (or j/k) to move, g to jump to the next
// group, Enter/Space to edit (boolean/enum toggle in place, number/string
// prompt), d twice to reset, / to filter, q/Esc to quit.
//
// All strings come from i18n (cfg.*), so the menu is fully localized. The
// component never touches config.ts directly: the caller passes get/set/reset
// callbacks (the SAME ones the legacy menu takes), so the logic is shared.

import React, { useMemo, useState } from 'react'
import { Box, Text, useInput, useApp, useWindowSize } from 'ink'
import type { TranslateFn } from '../i18n.js'
import type { ConfigField } from '../config.js'
import { Checkbox, Select, UI, HintBar } from './widgets.js'

/** Strip ANSI to measure a line's visible width. */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
}

/** Visible width in columns (wide chars count 2). */
function visCols(s: string): number {
  const str = stripAnsi(s)
  let w = 0
  for (const ch of str) {
    const cp = ch.codePointAt(0) as number
    w += cp >= 0x1100 ? 2 : 1
  }
  return w
}

export interface ConfigMenuInkOptions {
  fields: ConfigField[]
  t: TranslateFn
  get: (path: string) => unknown
  getDefault?: (path: string) => unknown
  set: (field: ConfigField, raw: string) => void
  reset: (field: ConfigField) => void
  onExit: () => void
}

function displayValue(
  field: ConfigField,
  value: unknown,
  t: TranslateFn,
): string {
  if (value === undefined) return t('cfg.menu.default')
  if (typeof value === 'boolean')
    return value ? t('common.on') : t('common.off')
  if (/password/i.test(field.path) && String(value).length > 0)
    return '********'
  return String(value)
}

export function ConfigMenuApp(opts: ConfigMenuInkOptions): React.ReactElement {
  const { fields, t, get, set, reset, getDefault } = opts
  const { exit } = useApp()
  const { columns, rows } = useWindowSize()

  const [cursor, setCursor] = useState(0)
  const [filterQuery, setFilterQuery] = useState('')
  const [filterMode, setFilterMode] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editBuf, setEditBuf] = useState('')
  const [pendingReset, setPendingReset] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // `get`/`set` mutate the LIVE config object in place, so React has no state
  // change to react to and the row kept the OLD value on screen after a
  // toggle/cycle (the operator saw «ru» while the config already held «en»).
  // Bump this counter after every mutation to force a re-render.
  const [version, setVersion] = useState(0)
  const bump = (): void => setVersion((v) => v + 1)

  const visible = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return fields
    return fields.filter((f) =>
      (f.path + ' ' + t(f.labelKey || f.path) + ' ' + t(f.groupKey))
        .toLowerCase()
        .includes(q),
    )
  }, [fields, filterQuery, t])

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

  const commitEdit = (): void => {
    const f = visible[cursor]
    const raw = editBuf.trim()
    setEditing(false)
    setEditBuf('')
    if (!f || !raw) {
      setMessage(null)
      return
    }
    try {
      set(f, raw)
      bump()
      setMessage(
        t('cfg.menu.saved', {
          v: f.path,
          value: displayValue(f, get(f.path), t),
        }),
      )
    } catch (e) {
      setMessage(String((e as Error).message || e))
    }
  }

  const activate = (): void => {
    const f = visible[cursor]
    if (!f) return
    if (f.type === 'boolean') {
      set(f, get(f.path) === true ? 'false' : 'true')
      bump()
      setMessage(null)
      return
    }
    if (f.type === 'enum' && f.values && f.values.length) {
      cycleEnum(f, 1)
      return
    }
    setEditing(true)
    setEditBuf(get(f.path) === undefined ? '' : String(get(f.path)))
  }

  /** Cycle an enum value by `dir` (+1 next, -1 prev). */
  const cycleEnum = (f: ConfigField, dir: number): void => {
    if (!f.values || !f.values.length) return
    const cur = String(get(f.path) ?? '')
    const idx = f.values.indexOf(cur)
    const base = idx < 0 ? 0 : idx
    const next = f.values[(base + dir + f.values.length) % f.values.length]
    set(f, next)
    bump()
    setMessage(null)
  }

  /** ←/→ acts on the focused row: cycle an enum, toggle a boolean. */
  const lateral = (dir: number): void => {
    const f = visible[cursor]
    if (!f) return
    if (f.type === 'enum') cycleEnum(f, dir)
    else if (f.type === 'boolean') {
      set(f, get(f.path) === true ? 'false' : 'true')
      bump()
      setMessage(null)
    }
  }

  const quit = (): void => {
    opts.onExit()
    exit()
  }

  useInput((input, key) => {
    if (editing) {
      if (key.return) {
        commitEdit()
        return
      }
      if (key.escape) {
        setEditing(false)
        setEditBuf('')
        return
      }
      if (key.ctrl && input === 'c') {
        quit()
        return
      }
      if (key.backspace || key.delete) {
        setEditBuf((b) => b.slice(0, -1))
        return
      }
      if (input && input >= ' ') setEditBuf((b) => b + input)
      return
    }

    if (filterMode) {
      if (key.return || key.escape) {
        setFilterMode(false)
        return
      }
      if (key.ctrl && input === 'c') {
        quit()
        return
      }
      if (key.backspace || key.delete) {
        setFilterQuery((q) => q.slice(0, -1))
        setCursor(0)
        return
      }
      if (input && input >= ' ') {
        setFilterQuery((q) => q + input)
        setCursor(0)
      }
      return
    }

    if (
      key.escape ||
      input === 'q' ||
      input === 'Q' ||
      (key.ctrl && input === 'c')
    ) {
      quit()
      return
    }
    if (input === '/') {
      setFilterMode(true)
      setMessage(null)
      return
    }
    if (key.leftArrow) {
      lateral(-1)
      return
    }
    if (key.rightArrow) {
      lateral(1)
      return
    }
    if (key.upArrow || input === 'k') {
      setCursor((c) =>
        visible.length ? (c - 1 + visible.length) % visible.length : 0,
      )
      setPendingReset(null)
      setMessage(null)
      return
    }
    if (key.downArrow || input === 'j') {
      setCursor((c) => (visible.length ? (c + 1) % visible.length : 0))
      setPendingReset(null)
      setMessage(null)
      return
    }
    if (input === 'g') {
      // Jump to the first field of the NEXT group (and back to the top).
      const curGroup = visible[cursor]?.groupKey
      let target = -1
      for (let k = cursor + 1; k < visible.length; k++) {
        if (visible[k].groupKey !== curGroup) {
          target = k
          break
        }
      }
      setCursor(target >= 0 ? target : 0)
      setMessage(null)
      return
    }
    if (key.return || input === ' ') {
      activate()
      return
    }
    if (input === 'd' || input === 'D') {
      const f = visible[cursor]
      if (!f) return
      if (pendingReset === f.path) {
        reset(f)
        bump()
        setMessage(t('cfg.reset', { v: f.path }))
        setPendingReset(null)
      } else {
        setPendingReset(f.path)
        setMessage(t('cfg.menu.reset_confirm', { v: f.path }))
      }
      return
    }
  })

  // Windowed list: show a slice around the cursor. The window is measured in
  // RENDERED ROWS, not items: each new group adds a header row, and reserving
  // only one row per item let the block grow taller than the terminal (the
  // top border/title scrolled off the alternate screen — the menu looked
  // "cut off at the top"). The chrome is the 6 fixed rows (2 borders, title,
  // 2 dividers, hint bar) plus up to 2 rows for the status area (edit prompt /
  // filter / message).
  const termRows = rows || 24
  const maxRows = Math.max(3, termRows - 8)
  const shown = useMemo(() => {
    const groupStart = (i: number): boolean =>
      i === 0 || visible[i].groupKey !== visible[i - 1].groupKey
    const rowsIn = (a: number, b: number): number => {
      let r = b - a
      for (let i = a; i < b; i++) if (groupStart(i)) r++
      return r
    }
    if (!visible.length) return { start: 0, end: 0 }
    let start = cursor
    let end = cursor + 1
    // Fill downward first, then upward, so the cursor stays visible and the
    // window uses the whole budget.
    while (end < visible.length && rowsIn(start, end + 1) <= maxRows) end++
    while (start > 0 && rowsIn(start - 1, end) <= maxRows) start--
    return { start, end }
  }, [cursor, visible, maxRows])

  const usable = Math.max(1, (columns || 80) - 1)
  void visCols
  void usable
  // Referenced so the value-cell recompute below depends on the mutation
  // counter (a pure `get()` call has no reactive dependency of its own).
  void version

  const items: React.ReactElement[] = []
  let lastGroup = ''
  for (let i = shown.start; i < shown.end; i++) {
    const f = visible[i]
    const g = f.groupKey
    if (i === shown.start || g !== lastGroup) {
      items.push(
        <Text key={'g' + i} color={UI.system}>
          {'  ' + t(f.groupKey).toUpperCase()}
        </Text>,
      )
      lastGroup = g
    }
    const selected = i === cursor
    const label = f.labelKey ? t(f.labelKey) : f.path
    const raw = get(f.path)
    const mod = isModified(f) ? '*' : ''
    // The VALUE cell depends on the field type: a checkbox for booleans, an
    // inline select for enums, plain text otherwise. The selected row shows
    // the path on the right as a hint.
    let valueCell: React.ReactElement
    if (f.type === 'boolean') {
      valueCell = <Checkbox checked={raw === true} focused={selected} />
    } else if (f.type === 'enum' && f.values && f.values.length) {
      valueCell = (
        <Select value={String(raw ?? f.values[0])} focused={selected} />
      )
    } else {
      valueCell = (
        <Text color={selected ? UI.text : UI.system}>
          {displayValue(f, raw, t)}
        </Text>
      )
    }
    items.push(
      <Text key={'f' + i}>
        <Text color={UI.accent}>{selected ? '❯ ' : '  '}</Text>
        <Text color={selected ? UI.accent : undefined} bold={selected}>
          {label}
        </Text>
        <Text color={UI.dim}>{'  '}</Text>
        {valueCell}
        {mod ? <Text color={UI.warn}>{' ' + mod}</Text> : null}
        {selected ? <Text color={UI.dim}>{'   ' + f.path}</Text> : null}
      </Text>,
    )
  }
  if (!visible.length) {
    items.push(
      <Text key="none" color={UI.dim}>
        {'  ' + t('cfg.menu.no_match')}
      </Text>,
    )
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={UI.border}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text bold color={UI.title}>
          {t('cfg.menu.title')}
        </Text>
        <Text color={UI.dim}>
          {(visible.length ? cursor + 1 : 0) + '/' + visible.length}
        </Text>
      </Box>
      <Text color="#3a3f4b">
        {'─'.repeat(Math.max(10, (columns || 80) - 6))}
      </Text>
      {items}
      <Text color="#3a3f4b">
        {'─'.repeat(Math.max(10, (columns || 80) - 6))}
      </Text>
      {editing ? (
        <Box flexDirection="column">
          <Text color={UI.text}>{t('cfg.menu.edit_hint')}</Text>
          <Text color={UI.accent}>{'❯ ' + editBuf}</Text>
        </Box>
      ) : filterMode ? (
        <Box flexDirection="column">
          <Text color={UI.text}>{t('cfg.menu.filter_hint')}</Text>
          <Text color={UI.accent}>{'❯ ' + filterQuery}</Text>
        </Box>
      ) : message ? (
        <Text color={UI.ok}>{message}</Text>
      ) : filterQuery ? (
        <Text color={UI.dim}>
          {t('cfg.menu.filter_active', { q: filterQuery })}
        </Text>
      ) : null}
      <HintBar
        hints={[
          ['↑/↓', 'выбор'],
          ['←/→', 'изменить'],
          ['Enter', 'правка'],
          ['/', 'поиск'],
          ['d', 'сброс'],
          ['q', 'выход'],
        ]}
      />
    </Box>
  )
}
