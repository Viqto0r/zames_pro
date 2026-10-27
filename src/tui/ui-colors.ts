// The Ink TUI's color map, derived from the ACTIVE terminal palette
// (src/theme.ts). Ink `<Text color>` takes a plain hex STRING, not a chalk
// function, so the TUI cannot reuse `theme` directly — this module is the one
// bridge between the two.
//
// `UI` is mutated IN PLACE by syncUiColors() (like `theme`): every component
// reads `UI.x` at RENDER time, so a /config theme switch repaints without
// re-importing anything. Components must never destructure a color at module
// load — that would freeze the palette at startup.

import { PALETTES, DEFAULT_THEME, isThemeName, type Palette } from '../theme.js'
import type { ThemeName } from '../types.js'

export interface UiColors {
  accent: string
  accentDim: string
  text: string
  dim: string
  border: string
  on: string
  off: string
  ok: string
  warn: string
  err: string
  system: string
  title: string
}

/** Derive the Ink map from a terminal palette. */
export function uiColorsFrom(p: Palette): UiColors {
  return {
    accent: p.prompt,
    accentDim: p.turnLabel,
    text: p.assistant,
    dim: p.dim,
    border: p.turnRule,
    on: p.toggleOn,
    off: p.dim,
    ok: p.success,
    warn: p.warn,
    err: p.error,
    system: p.system,
    title: p.taskSummary,
  }
}

export const UI: UiColors = uiColorsFrom(PALETTES[DEFAULT_THEME])

// Border STYLE of the framed surfaces (the input box today). Ink only ships a
// handful of box styles; 'none' draws no frame at all. Kept next to the colors
// because it is the same kind of presentation state, and mutated in place so a
// /config switch applies without re-importing anything.
let inputBorder = 'round'

/** Switch the input frame style ('round'|'single'|'double'|'bold'|'none'). */
export function setInputBorder(name: unknown): string {
  const v = String(name ?? '')
    .trim()
    .toLowerCase()
  inputBorder =
    v === 'none' ||
    v === 'single' ||
    v === 'double' ||
    v === 'bold' ||
    v === 'round'
      ? v
      : 'round'
  return inputBorder
}

/** The current input frame style as an Ink borderStyle value (none = no box). */
export function inputBorderStyle():
  'round' | 'single' | 'double' | 'bold' | undefined {
  if (inputBorder === 'none') return undefined
  return inputBorder as 'round' | 'single' | 'double' | 'bold'
}

/** Border columns the frame consumes (2 = left + right, 0 when off). */
export function inputBorderCols(): number {
  return inputBorderStyle() ? 2 : 0
}

/** Repaint the Ink widgets with the palette of `name` (unknown -> default). */
export function syncUiColors(name: unknown): ThemeName {
  const id = isThemeName(name) ? name : DEFAULT_THEME
  const next = uiColorsFrom(PALETTES[id])
  for (const key of Object.keys(next) as Array<keyof UiColors>) {
    UI[key] = next[key]
  }
  return id
}
