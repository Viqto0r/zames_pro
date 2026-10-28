// The live INPUT LINE — a wrapping, multi-line editor rendered by Ink with a
// real terminal cursor (useCursor), so IME composition and the caret land on
// the right cell.
//
// The editor state transitions are PURE (src/tui/edit.ts) and the key mapping
// is PURE (src/tui/keys.ts). This component owns only the imperative parts:
// reading key events from Ink's useInput, bracketed paste from usePaste,
// calling the operator callbacks (submit / abort / attach), and painting the
// visual rows via the shared layoutInput.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Text,
  useInput,
  usePaste,
  useCursor,
  useWindowSize,
  useStdin,
} from 'ink'
import type { Key } from 'ink'
import { translate, type Locale } from '../i18n.js'
import {
  expandPastes,
  inputInnerCols,
  layoutInput,
  SUGGEST_PAGE,
  type SlashCommand,
} from '../input/layout.js'
import { screenInnerCols, screenGutter } from '../input/layout.js'
import {
  insertText,
  insertPaste,
  insertNewline,
  backspace,
  del,
  moveLeft,
  moveRight,
  moveHome,
  moveEnd,
  wordLeft,
  wordRight,
  deleteWordLeft,
  deleteWordRight,
  killToLineEnd,
  moveVisualRows,
  pushUndo,
  undoEdit,
  historyUp,
  historyDown,
  searchStart,
  searchNext,
  searchAccept,
  searchCancel,
  searchInput,
  searchBackspace,
  recordHistory,
  afterSubmit,
  rememberDraft,
  type EditState,
} from './edit.js'
import { dispatchKey, parseCsiU } from './keys.js'
import { useSyncExternalStore } from 'react'
import type { TuiStore } from './store.js'
import {
  matchSlashCommands,
  suggestWindow,
  completeSlashCommand,
} from '../input/suggest.js'
import { suggestRowCount } from '../input/suggest.js'
import type { Attachment } from '../attachments.js'
import { UI, inputBorderStyle } from './ui-colors.js'

export interface InputLineProps {
  prompt: string
  locale: Locale
  commands: SlashCommand[]
  locked: boolean
  /**
   * Rows ABOVE the input box in the Ink output (status/divider/header/log).
   * The terminal cursor is positioned as `cursorTop + cursorRow`, so this MUST
   * match the real layout or the caret lands off the box (inline: 3 — divider
   * + status + top border; full-screen: header + log + status + border).
   */
  cursorTop?: number
  /** The shared store that owns the editor state (survives remounts). */
  store: TuiStore
  /** Called on submit with the raw buffer + attachments. */
  onSubmit: (text: string, attachments: Attachment[]) => void
  /** Called on Esc (abort generation). */
  onEscape: () => void
  onCtrlC: () => void
  /** Called with a pasted path/data to attach it. */
  onAttach: (raw: string) => Promise<Attachment | null> | Attachment | null
  /** Called to try the OS clipboard for an image. */
  onClipboard: () => Promise<Attachment | null>
  /** Persist the history after a new entry. */
  onHistoryChange: (h: string[]) => void
  /** Clear the terminal screen (Ctrl+L). */
  onClearScreen: () => void
  /** The current attachments (markers shown in the buffer). */
  attachments: Attachment[]
  /** Bubble paste markers up so the adapter can expand them on submit. */
  onPastesChange: (pastes: Array<{ marker: string; text: string }>) => void
}

/** Render the visual rows of the buffer with the prompt on the first row. */
function InputRows({
  prompt,
  buf,
  cols,
}: {
  prompt: string
  buf: string
  cols: number
}): React.ReactElement {
  const lay = layoutInput(prompt, buf, 0, cols)
  return (
    <Box flexDirection="column">
      {lay.rows.map((r, i) => (
        <Text key={i}>
          <Text color={UI.accent} bold>
            {r.prefix}
          </Text>
          {/* The typed text itself is the PALETTE's answer color: a wrapped
              continuation row must look like the same text, not like a dimmed
              gutter. Without an explicit color Ink falls back to the terminal
              default, which is why a multi-line input looked "unthemed". */}
          <Text color={UI.text}>{r.text}</Text>
        </Text>
      ))}
    </Box>
  )
}

export function InputLine(props: InputLineProps): React.ReactElement {
  // Pane width (gutter excluded): the box must not be wider than the padded
  // root, or it overflows the row and the caret math drifts.
  const { columns } = useWindowSize()
  const cols = screenInnerCols(columns || 80)
  const { setCursorPosition } = useCursor()

  const [suggestSelected, setSuggestSelected] = useState(-1)
  // The visible page of the suggestion list follows the SELECTION: with more
  // matches than one page, Ctrl+N could move the selection past the page and
  // the highlight vanished (the operator "lost" the selected command). Derive
  // the offset from the selection instead of keeping a separate state.
  const suggestOffset =
    suggestSelected < 0 ? 0 : suggestSelected - (suggestSelected % SUGGEST_PAGE)

  // The editor state lives in the STORE (props.store), read via
  // useSyncExternalStore. This is what makes the typed line survive an Ink
  // remount (a resize / pause): a local useState would be reset to empty on
  // every remount, wiping what the operator had typed.
  const st: EditState = useSyncExternalStore(
    props.store.subscribe,
    () => props.store.getSnapshot().edit,
  )
  const setSt = useCallback(
    (next: EditState | ((prev: EditState) => EditState)) => {
      props.store.update((snap) => ({
        edit: typeof next === 'function' ? next(snap.edit) : next,
      }))
    },
    [props.store],
  )

  // The input lives inside a rounded box: 2 columns of border (left/right) plus
  // 1 column of inner padding on each side, so the CONTENT width is `cols - 4`.
  // Use the SHARED helper: `inputBoxRows()` — the height the full-screen layout
  // reserves — is computed from the SAME function, and a hand-written
  // `Math.max(4, cols - 4)` here was one independent copy that could drift from
  // the reservation (the box then rendered more rows than were reserved and the
  // input rows overprinted the status bar).
  // The frame style comes from ui.inputBorder (set live by /config): round
  // (default), single, double, bold, none. Read per render so a switch applies
  // immediately; 'none' also frees the two border columns for the text.
  const borderStyle = inputBorderStyle()
  const innerCols = inputInnerCols(cols, borderStyle ? 2 : 0)

  // Mirror the state into a ref so the useInput callback (a stable closure Ink
  // calls for every key) always sees the latest values.
  const stRef = useRef(st)
  stRef.current = st

  // Layout for the CURRENT state — cursor positioning + visual-edge check.
  const lay = useMemo(
    () => layoutInput(props.prompt, st.buf, st.cursor, innerCols),
    [props.prompt, st.buf, st.cursor, innerCols],
  )

  const suggestions = useMemo(
    () => matchSlashCommands(st.buf, props.commands),
    [st.buf, props.commands],
  )

  const apply = useCallback(
    (fn: (s: EditState) => EditState) => {
      setSt((prev) => {
        const next = fn(prev)
        if (next.pastes !== prev.pastes) props.onPastesChange(next.pastes)
        return next
      })
    },
    [props],
  )

  const doSubmit = useCallback(() => {
    const s = stRef.current
    if (props.locked) return
    if (!s.buf.trim()) return
    // Record the EXPANDED text in the history: the buffer holds a
    // `[Pasted lines#N]` marker for a large paste, the adapter expands it from
    // the paste list, and `afterSubmit` CLEARS that list. Storing the marker
    // made a later Up recall send the literal marker (no body to expand).
    const expanded = expandPastes(s.pastes, s.buf)
    const withHist = recordHistory(s, expanded)
    const next = afterSubmit(withHist)
    setSt(next)
    props.onHistoryChange(withHist.history)
    // onSubmit MUST run BEFORE the paste list is cleared: the Ink adapter
    // (TuiEditor.handleSubmit) expands `[Pasted lines#N]` markers by reading
    // the store's paste list, so clearing it first sent the literal marker to
    // the agent instead of the pasted text.
    props.onSubmit(s.buf, props.attachments.slice())
    props.onPastesChange(next.pastes)
  }, [props])

  const handlePaste = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = String(text).trim()
      const looksPath =
        !/\s/.test(trimmed) && /[./\\]/.test(trimmed) && trimmed.length < 500
      if (looksPath || trimmed.startsWith('data:')) {
        try {
          const att = await props.onAttach(text)
          if (att) {
            apply((s) => insertText(s, att.marker))
            return
          }
        } catch {
          // fall through to plain insert
        }
      }
      apply((s) => insertPaste(s, text))
    },
    [apply, props],
  )

  const tryClipboard = useCallback(async () => {
    try {
      const att = await props.onClipboard()
      if (att) apply((s) => insertText(s, att.marker))
    } catch {
      // ignore
    }
  }, [apply, props])

  const runAction = useCallback(
    (action: ReturnType<typeof dispatchKey>): void => {
      if (!action) return
      switch (action.type) {
        case 'submit':
          doSubmit()
          return
        // The EDIT actions first write the line into the draft slot, so a
        // remembered draft is replaced only by a REAL edit and an accidental
        // Up cannot lose the typed message.
        case 'newline':
          apply((s) => pushUndo(rememberDraft(insertNewline(s)), true))
          return
        case 'insert':
          apply((s) =>
            pushUndo(rememberDraft(insertText(s, action.text)), true),
          )
          return
        case 'backspace':
          apply((s) => backspace(pushUndo(rememberDraft(s), true)))
          return
        case 'delete':
          apply((s) => del(pushUndo(rememberDraft(s), true)))
          return
        case 'left':
          apply(moveLeft)
          return
        case 'right':
          apply(moveRight)
          return
        case 'up':
          apply((s) => moveVisualRows(s, -1, props.prompt, innerCols))
          return
        case 'down':
          apply((s) => moveVisualRows(s, 1, props.prompt, innerCols))
          return
        case 'home':
          apply(moveHome)
          return
        case 'end':
          apply(moveEnd)
          return
        case 'wordLeft':
          apply(wordLeft)
          return
        case 'wordRight':
          apply(wordRight)
          return
        case 'deleteWordLeft':
          apply((s) => deleteWordLeft(pushUndo(s)))
          return
        case 'deleteWordRight':
          apply((s) => deleteWordRight(pushUndo(s)))
          return
        case 'killToEnd':
          apply((s) => killToLineEnd(pushUndo(s)))
          return
        case 'clearLine':
          apply((s) => ({ ...pushUndo(s), buf: '', cursor: 0, pastes: [] }))
          return
        case 'undoEdit':
          apply(undoEdit)
          return
        case 'complete':
          apply((s) => {
            const next = completeSlashCommand(
              s.buf,
              matchSlashCommands(s.buf, props.commands),
              suggestSelected,
            )
            if (next === null) return s
            return { ...s, buf: next, cursor: Array.from(next).length }
          })
          return
        case 'suggestNext':
          setSuggestSelected((n) =>
            Math.min(suggestions.length - 1, (n < 0 ? -1 : n) + 1),
          )
          return
        case 'suggestPrev':
          setSuggestSelected((n) => Math.max(-1, n - 1))
          return
        case 'historyPrev':
          apply(historyUp)
          return
        case 'historyNext':
          apply(historyDown)
          return
        case 'searchStart':
          apply(searchStart)
          return
        case 'searchNext':
          apply(searchNext)
          return
        case 'searchAccept':
          apply(searchAccept)
          return
        case 'searchCancel':
          apply(searchCancel)
          return
        case 'searchInput':
          apply((s) => searchInput(s, action.text))
          return
        case 'searchBackspace':
          apply(searchBackspace)
          return
        case 'escape':
          props.onEscape()
          return
        case 'ctrlC':
        case 'ctrlD':
          props.onCtrlC()
          return
        case 'clearScreen':
          props.onClearScreen()
          return
        case 'clipboard':
          void tryClipboard()
          return
        default:
          return
      }
    },
    [
      apply,
      props,
      suggestions,
      suggestSelected,
      innerCols,
      doSubmit,
      tryClipboard,
    ],
  )

  // The raw-stdin CSI-u handler is bound ONCE (its effect depends only on
  // stdin), so it reads the latest `runAction` through a ref — otherwise the
  // effect would re-bind on every render and could miss keystrokes.
  const runActionRef = useRef(runAction)
  runActionRef.current = runAction

  useInput(
    (input: string, key: Key) => {
      const s = stRef.current
      if (props.locked) {
        if (key.ctrl && input === 'c') props.onCtrlC()
        return
      }
      const curLay = layoutInput(props.prompt, s.buf, s.cursor, innerCols)
      const atTop = curLay.cursorRow === 0
      const atBottom = curLay.cursorRow === curLay.rows.length - 1
      const action = dispatchKey(
        input,
        key,
        {
          searchMode: s.searchMode,
          bufferEmpty: s.buf.length === 0,
          // A trailing backslash before the cursor = line continuation: Enter
          // then inserts a newline (and drops the backslash).
          endsWithBackslash: Array.from(s.buf)[s.cursor - 1] === '\\',
        },
        { atTop, atBottom },
      )
      runAction(action)
    },
    { isActive: true },
  )

  // Bracketed paste arrives on a SEPARATE channel — Ink enables the paste mode
  // automatically. Deliver the whole string to the same handler.
  usePaste((text: string) => {
    void handlePaste(text)
  })

  // RAW STDIN fallback for the KITTY CSI-u forms Ink DROPS. Ink hides the raw
  // `sequence` for these (it yields `input=''`), so the modified
  // Delete/Backspace bindings never fired (the operator's "Ctrl+Delete does
  // nothing"). The legacy LineEditor parsed the bytes itself; we read the same
  // raw stream here. Sequences split across reads are carried over.
  const { stdin: rawStdin, isRawModeSupported } = useStdin()
  useEffect(() => {
    if (!isRawModeSupported) return
    let carry = ''
    const onRaw = (data: Buffer | string): void => {
      const s = typeof data === 'string' ? data : data.toString('utf-8')
      const buf = carry + s
      // Hold a trailing INCOMPLETE CSI-u sequence for the next read.
      const m = /\u001b\[[0-9;:]*$/.exec(buf)
      carry = m ? m[0] : ''
      const scan = carry ? buf.slice(0, buf.length - carry.length) : buf
      // Find every complete CSI-u sequence and dispatch it.
      const re = /\u001b\[[0-9;:]*u/g
      let hit: RegExpExecArray | null
      while ((hit = re.exec(scan)) !== null) {
        const action = parseCsiU(hit[0])
        if (action) runActionRef.current(action)
      }
    }
    rawStdin.on('data', onRaw)
    return () => {
      rawStdin.removeListener('data', onRaw)
    }
  }, [rawStdin, isRawModeSupported])

  // Position the real terminal cursor on the input cell. `y` is the row within
  // the live Ink output BELOW the log. Panel layout (top to bottom):
  //   row 0            = divider
  //   row 1            = status bar
  //   row 2            = input box TOP border
  //   rows 3..         = input rows
  const cursorRow = lay.cursorRow
  const cursorX =
    // The input rows sit inside the rounded box, indented by 1 column for the
    // left border and 1 for the box's inner padding. `layoutInput().cursorCol`
    // is ALREADY a column count that includes the prompt prefix (wide chars
    // counted as 2), so the terminal column is just 2 + cursorCol. The old
    // code re-measured `rowText` up to `cursorCol` code points, which
    // DOUBLE-counted wide chars: a CJK buffer put the caret at the line end
    // instead of under the cursor.
    // 2 (box border + inner padding) + the ROOT gutter (paddingLeft of the
    // full-screen/inline root) + the column inside the box. The gutter was
    // forgotten: at 170 columns the root pads 2, so the caret sat exactly 2
    // cells LEFT of the text the operator typed.
    screenGutter(columns || 80) + 2 + lay.cursorCol
  // The suggestion popup is drawn ABOVE the box in THIS component, so it pushes
  // the input rows DOWN by its own height. `cursorTop` (from the app) counts
  // the rows above the INPUT BOX, not above the popup, so the popup rows are
  // added HERE — exactly where they are rendered. (A caller that folded them
  // in as well double-counted them and the caret landed inside the popup.)
  const popupRows =
    suggestions.length > 0 ? suggestRowCount(st.buf, props.commands, cols) : 0
  setCursorPosition({
    x: cursorX,
    y: (props.cursorTop ?? 3) + popupRows + cursorRow,
  })

  const { shown, moreCount } = suggestWindow(suggestions, suggestOffset)
  const t = translate(props.locale)

  return (
    <Box flexDirection="column">
      {suggestions.length > 0 && (
        <Box flexDirection="column">
          {shown.map((c, i) => {
            const label = c.hint ? c.name + ' ' + c.hint : c.name
            const selected = suggestOffset + i === suggestSelected
            return (
              <Text key={c.name}>
                <Text color={UI.accent}>{selected ? ' ▸ ' : '   '}</Text>
                <Text color={UI.accent}>{label}</Text>
                <Text color={UI.dim}>{'  ' + c.description}</Text>
              </Text>
            )
          })}
          {moreCount > 0 && (
            <Text color={UI.dim}>
              {'   ' +
                t('editor.more', { n: String(moreCount) }) +
                '  ' +
                t('editor.page_hint')}
            </Text>
          )}
        </Box>
      )}
      <Box
        borderStyle={borderStyle}
        borderColor={props.locked ? UI.dim : UI.accent}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
      >
        <InputRows prompt={props.prompt} buf={st.buf} cols={innerCols} />
      </Box>
    </Box>
  )
}
