// The LIGHT palettes, appended to the main palette map. They live in their own
// module only to keep src/theme.ts readable; the TYPE of a palette and the
// registry stay there.

import type { Palette } from './theme.js'

// A dark terminal with a light theme looks broken: these are picked together
// with the window background (OSC-11), so the whole surface flips. The hues are
// the LIGHT variants of the corresponding editor schemes (One Light, GitHub
// Light, Solarized Light, Gruvbox Light, Ayu Light), not a desaturated copy of
// the dark ones.

export const LIGHT_PALETTES: Record<string, Palette> = {
  // One Light — Atom's light counterpart of One Dark.
  'one-light': {
    bg: '#fafafa',
    user: '#0184bc',
    userBar: '#7fb3cc',
    turnRule: '#e5e5e6',
    turnLabel: '#a0a1a7',
    prompt: '#c18401',
    dir: '#0184bc',
    assistant: '#383a42',
    tool: '#986801',
    toolResult: '#696c77',
    system: '#696c77',
    dim: '#a0a1a7',
    taskSummary: '#4078f2',
    warn: '#c18401',
    error: '#e45649',
    success: '#50a14f',
    brown: '#986801',
    toggleOn: '#0184bc',
  },
  // GitHub Light — GitHub's light UI.
  'github-light': {
    bg: '#ffffff',
    user: '#0969da',
    userBar: '#7ab0e8',
    turnRule: '#eaeef2',
    turnLabel: '#8c959f',
    prompt: '#9a6700',
    dir: '#0550ae',
    assistant: '#1f2328',
    tool: '#bc4c00',
    toolResult: '#57606a',
    system: '#57606a',
    dim: '#8c959f',
    taskSummary: '#0550ae',
    warn: '#9a6700',
    error: '#cf222e',
    success: '#1a7f37',
    brown: '#bc4c00',
    toggleOn: '#0a7ea4',
  },
  // Solarized Light — the light side of Ethan Schoonover's palette.
  'solarized-light': {
    bg: '#fdf6e3',
    user: '#268bd2',
    userBar: '#93b8d4',
    turnRule: '#eee8d5',
    turnLabel: '#93a1a1',
    prompt: '#b58900',
    dir: '#2aa198',
    assistant: '#657b83',
    tool: '#cb4b16',
    toolResult: '#839496',
    system: '#839496',
    dim: '#93a1a1',
    taskSummary: '#2aa198',
    warn: '#b58900',
    error: '#dc322f',
    success: '#859900',
    brown: '#cb4b16',
    toggleOn: '#2aa198',
  },
  // Gruvbox Light — the warm light variant.
  'gruvbox-light': {
    bg: '#fbf1c7',
    user: '#458588',
    userBar: '#8fb5b6',
    turnRule: '#ebdbb2',
    turnLabel: '#a89984',
    prompt: '#b57614',
    dir: '#458588',
    assistant: '#3c3836',
    tool: '#af3a03',
    toolResult: '#7c6f64',
    system: '#7c6f64',
    dim: '#a89984',
    taskSummary: '#79740e',
    warn: '#b57614',
    error: '#9d0006',
    success: '#79740e',
    brown: '#af3a03',
    toggleOn: '#427b58',
  },
  // Ayu Light — the light side of the Ayu scheme.
  'ayu-light': {
    bg: '#fafafa',
    user: '#399ee6',
    userBar: '#9dc8ea',
    turnRule: '#eceef0',
    turnLabel: '#abb0b6',
    prompt: '#fa8d3e',
    dir: '#399ee6',
    assistant: '#5c6166',
    tool: '#f2ae49',
    toolResult: '#787b80',
    system: '#787b80',
    dim: '#abb0b6',
    taskSummary: '#55b4d4',
    warn: '#fa8d3e',
    error: '#f51818',
    success: '#86b300',
    brown: '#f2ae49',
    toggleOn: '#4cbf99',
  },
}
