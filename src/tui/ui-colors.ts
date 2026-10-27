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

/** Repaint the Ink widgets with the palette of `name` (unknown -> default). */
export function syncUiColors(name: unknown): ThemeName {
  const id = isThemeName(name) ? name : DEFAULT_THEME
  const next = uiColorsFrom(PALETTES[id])
  for (const key of Object.keys(next) as Array<keyof UiColors>) {
    UI[key] = next[key]
  }
  return id
}
