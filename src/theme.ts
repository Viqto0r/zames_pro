import chalk, { type ChalkInstance } from 'chalk'
import { contentWidth } from './width.js'
import { applyBackground } from './tui/background.js'
import type { ThemeName } from './types.js'

// Respect NO_COLOR (https://no-color.org): when the operator sets it (any
// non-empty value) drop ALL SGR codes so the output can be piped into a file
// or a log viewer without escape noise. chalk 5 only auto-detects TTY/CI, it
// does NOT read NO_COLOR, so the level is set explicitly here — the one place
// the palette is built, so every consumer (theme, spinner, Ink Text colors
// that go through chalk) is covered. chalk.level is the documented override.
if (process.env.NO_COLOR) {
  chalk.level = 0
}

// ---------- palettes ----------
//
// Roles (the keys every palette must define):
//   - user        — operator messages
//   - userBar     — the `▌` bar marking an operator turn
//   - turnRule / turnLabel — the dim rule + label between conversation turns
//   - prompt      — the input prompt (noticeable)
//   - dir         — working directory name
//   - assistant   — model answers
//   - tool / toolResult — tool call + its preview
//   - system / dim — neutral service text, two levels
//   - taskSummary — the per-task summary line
//   - warn / error / success — semantics
//   - brown       — spinner/status base (a calm, non-alarming tone)
//   - toggleOn    — a live toggle is ON
//
// `bg` is the terminal background each palette was designed for; it is NOT used
// for rendering (the terminal owns the background) but the README screenshot
// generator (scripts/render-demo.mts) uses it, and it documents the intent.
//
// The FIRST palette ('zames') is the historical built-in one and the default;
// the rest are ports of well-known editor schemes so the operator can pick a
// familiar look. Only the mapping to OUR semantic roles is adapted (e.g. an
// editor's "comment" gray becomes `dim`, its "string" color becomes
// `success`), the hues themselves are the originals.

/**
 * A palette indexed by role. The index signature exists ONLY so the raw map
 * can be handed to the Ink TUI, which takes plain hex strings; the named keys
 * below are what the rest of the code reads.
 */
export interface Palette {
  [role: string]: string
  bg: string
  user: string
  userBar: string
  turnRule: string
  turnLabel: string
  prompt: string
  dir: string
  assistant: string
  tool: string
  toolResult: string
  system: string
  dim: string
  taskSummary: string
  warn: string
  error: string
  success: string
  brown: string
  toggleOn: string
}

export const PALETTES: Record<ThemeName, Palette> = {
  // zames — the original calm palette (Tokyo Night / Nord spirit): muted,
  // slightly faded tones, comfortable for long answers.
  zames: {
    bg: '#23272e',
    user: '#8fd4f0',
    userBar: '#4a8fb5',
    turnRule: '#3a3f4b',
    turnLabel: '#5b616e',
    prompt: '#c8b06a',
    dir: '#7fc4f0',
    assistant: '#cfc9b0',
    tool: '#c6a97e',
    toolResult: '#8a9bb5',
    system: '#808896',
    dim: '#5b616e',
    taskSummary: '#8fa3c8',
    warn: '#c9a86a',
    error: '#c98a80',
    success: '#a9c08c',
    brown: '#a1723f',
    toggleOn: '#6fd0b0',
  },
  // One Dark — Atom's default theme, the most recognized "modern editor" look.
  'one-dark': {
    bg: '#282c34',
    user: '#61afef',
    userBar: '#3e6f9e',
    turnRule: '#3b4048',
    turnLabel: '#5c6370',
    prompt: '#e5c07b',
    dir: '#61afef',
    assistant: '#abb2bf',
    tool: '#d19a66',
    toolResult: '#7f8b9e',
    system: '#828997',
    dim: '#5c6370',
    taskSummary: '#56b6c2',
    warn: '#e5c07b',
    error: '#e06c75',
    success: '#98c379',
    brown: '#d19a66',
    toggleOn: '#56b6c2',
  },
  // Dracula — high-contrast purple/pink, extremely popular.
  dracula: {
    bg: '#282a36',
    user: '#8be9fd',
    userBar: '#4f8fa6',
    turnRule: '#3d4152',
    turnLabel: '#6272a4',
    prompt: '#f1fa8c',
    dir: '#8be9fd',
    assistant: '#f8f8f2',
    tool: '#ffb86c',
    toolResult: '#b0b8d8',
    system: '#9aa2c0',
    dim: '#6272a4',
    taskSummary: '#8be9fd',
    warn: '#ffb86c',
    error: '#ff5555',
    success: '#50fa7b',
    brown: '#bd93f9',
    toggleOn: '#50fa7b',
  },
  // Gruvbox Dark — warm retro earth tones.
  gruvbox: {
    bg: '#282828',
    user: '#83a598',
    userBar: '#5a7a6e',
    turnRule: '#3c3836',
    turnLabel: '#665c54',
    prompt: '#fabd2f',
    dir: '#83a598',
    assistant: '#ebdbb2',
    tool: '#fe8019',
    toolResult: '#a89984',
    system: '#928374',
    dim: '#665c54',
    taskSummary: '#8ec07c',
    warn: '#fabd2f',
    error: '#fb4934',
    success: '#b8bb26',
    brown: '#d65d0e',
    toggleOn: '#b8bb26',
  },
  // Nord — cool arctic blues, low contrast by design.
  nord: {
    bg: '#2e3440',
    user: '#88c0d0',
    userBar: '#5e81a8',
    turnRule: '#3b4252',
    turnLabel: '#616e88',
    prompt: '#ebcb8b',
    dir: '#88c0d0',
    assistant: '#d8dee9',
    tool: '#d08770',
    toolResult: '#9aa7bd',
    system: '#8b95a8',
    dim: '#616e88',
    taskSummary: '#81a1c1',
    warn: '#ebcb8b',
    error: '#bf616a',
    success: '#a3be8c',
    brown: '#d08770',
    toggleOn: '#8fbcbb',
  },
  // Monokai — the classic Sublime Text scheme.
  monokai: {
    bg: '#272822',
    user: '#66d9ef',
    userBar: '#3f8c9e',
    turnRule: '#3e3d32',
    turnLabel: '#75715e',
    prompt: '#e6db74',
    dir: '#66d9ef',
    assistant: '#f8f8f2',
    tool: '#fd971f',
    toolResult: '#a6a695',
    system: '#a1a19a',
    dim: '#75715e',
    taskSummary: '#66d9ef',
    warn: '#e6db74',
    error: '#f92672',
    success: '#a6e22e',
    brown: '#fd971f',
    toggleOn: '#a6e22e',
  },
  // Solarized Dark — Ethan Schoonover's precision palette.
  'solarized-dark': {
    bg: '#002b36',
    user: '#268bd2',
    userBar: '#1f6a9e',
    turnRule: '#073642',
    turnLabel: '#586e75',
    prompt: '#b58900',
    dir: '#2aa198',
    assistant: '#93a1a1',
    tool: '#cb4b16',
    toolResult: '#839496',
    system: '#839496',
    dim: '#586e75',
    taskSummary: '#2aa198',
    warn: '#b58900',
    error: '#dc322f',
    success: '#859900',
    brown: '#cb4b16',
    toggleOn: '#2aa198',
  },
  // Tokyo Night — the modern neon-on-midnight scheme.
  'tokyo-night': {
    bg: '#1a1b26',
    user: '#7dcfff',
    userBar: '#3d7fa6',
    turnRule: '#2a2e3f',
    turnLabel: '#565f89',
    prompt: '#e0af68',
    dir: '#7dcfff',
    assistant: '#c0caf5',
    tool: '#ff9e64',
    toolResult: '#9aa5ce',
    system: '#787c99',
    dim: '#565f89',
    taskSummary: '#7aa2f7',
    warn: '#e0af68',
    error: '#f7768e',
    success: '#9ece6a',
    brown: '#ff9e64',
    toggleOn: '#73daca',
  },
  // Catppuccin Mocha — the soft pastel palette that took over the editor
  // ecosystem (Neovim, VS Code, terminals).
  catppuccin: {
    bg: '#1e1e2e',
    user: '#89b4fa',
    userBar: '#5477a8',
    turnRule: '#313244',
    turnLabel: '#6c7086',
    prompt: '#f9e2af',
    dir: '#89dceb',
    assistant: '#cdd6f4',
    tool: '#fab387',
    toolResult: '#a6adc8',
    system: '#9399b2',
    dim: '#6c7086',
    taskSummary: '#89b4fa',
    warn: '#f9e2af',
    error: '#f38ba8',
    success: '#a6e3a1',
    brown: '#eba0ac',
    toggleOn: '#94e2d5',
  },
  // GitHub Dark — the palette of GitHub's dark UI (familiar to anyone who
  // reads diffs all day).
  'github-dark': {
    bg: '#0d1117',
    user: '#58a6ff',
    userBar: '#3a6ea8',
    turnRule: '#21262d',
    turnLabel: '#6e7681',
    prompt: '#d29922',
    dir: '#79c0ff',
    assistant: '#c9d1d9',
    tool: '#ffa657',
    toolResult: '#8b949e',
    system: '#8b949e',
    dim: '#6e7681',
    taskSummary: '#a5d6ff',
    warn: '#d29922',
    error: '#f85149',
    success: '#3fb950',
    brown: '#db6d28',
    toggleOn: '#56d4dd',
  },
  // Ayu Dark — the minimal warm-accent scheme from the Ayu editor theme.
  ayu: {
    bg: '#0f1419',
    user: '#59c2ff',
    userBar: '#35789e',
    turnRule: '#1f2430',
    turnLabel: '#5c6773',
    prompt: '#ffb454',
    dir: '#59c2ff',
    assistant: '#c7ccd1',
    tool: '#ff8f40',
    toolResult: '#a0a8b0',
    system: '#8a9199',
    dim: '#5c6773',
    taskSummary: '#39bae6',
    warn: '#ffb454',
    error: '#f07178',
    success: '#aad94c',
    brown: '#e6b450',
    toggleOn: '#95e6cb',
  },
  // Rosé Pine — muted rose-pine tones, a calmer alternative to Dracula.
  'rose-pine': {
    bg: '#191724',
    user: '#9ccfd8',
    userBar: '#5b8490',
    turnRule: '#26233a',
    turnLabel: '#6e6a86',
    prompt: '#f6c177',
    dir: '#9ccfd8',
    assistant: '#e0def4',
    tool: '#ebbcba',
    toolResult: '#908caa',
    system: '#908caa',
    dim: '#6e6a86',
    taskSummary: '#c4a7e7',
    warn: '#f6c177',
    error: '#eb6f92',
    success: '#31748f',
    brown: '#ebbcba',
    toggleOn: '#9ccfd8',
  },
  // Everforest — the soft green forest palette (low contrast, easy on eyes).
  everforest: {
    bg: '#2d353b',
    user: '#7fbbb3',
    userBar: '#5a8b85',
    turnRule: '#3d484d',
    turnLabel: '#859289',
    prompt: '#dbbc7f',
    dir: '#7fbbb3',
    assistant: '#d3c6aa',
    tool: '#e69875',
    toolResult: '#9da9a0',
    system: '#859289',
    dim: '#7a8478',
    taskSummary: '#a7c080',
    warn: '#dbbc7f',
    error: '#e67e80',
    success: '#a7c080',
    brown: '#e69875',
    toggleOn: '#83c092',
  },

  // Tokyo Night Storm — the slightly bluer variant of Tokyo Night.
  'tokyo-storm': {
    bg: '#24283b',
    user: '#7dcfff',
    userBar: '#3d7fa6',
    turnRule: '#2f3549',
    turnLabel: '#565f89',
    prompt: '#e0af68',
    dir: '#7dcfff',
    assistant: '#c0caf5',
    tool: '#ff9e64',
    toolResult: '#9aa5ce',
    system: '#7d84a8',
    dim: '#565f89',
    taskSummary: '#7aa2f7',
    warn: '#e0af68',
    error: '#f7768e',
    success: '#9ece6a',
    brown: '#ff9e64',
    toggleOn: '#73daca',
  },
  // Night Owl — Sarah Drasner's dark blue scheme from VS Code.
  'night-owl': {
    bg: '#011627',
    user: '#82aaff',
    userBar: '#4b6a9b',
    turnRule: '#122d42',
    turnLabel: '#637777',
    prompt: '#ecc48d',
    dir: '#7fdbca',
    assistant: '#d6deeb',
    tool: '#f78c6c',
    toolResult: '#8badc1',
    system: '#7d8fa9',
    dim: '#637777',
    taskSummary: '#c792ea',
    warn: '#ecc48d',
    error: '#ef5350',
    success: '#addb67',
    brown: '#f78c6c',
    toggleOn: '#21c7a8',
  },
  // Material — the Material Theme Ocean (dark) palette.
  material: {
    bg: '#0f111a',
    user: '#82aaff',
    userBar: '#46608f',
    turnRule: '#1a1f35',
    turnLabel: '#4b526d',
    prompt: '#ffcb6b',
    dir: '#89ddff',
    assistant: '#a6accd',
    tool: '#f78c6c',
    toolResult: '#8b93b5',
    system: '#717cb4',
    dim: '#4b526d',
    taskSummary: '#c792ea',
    warn: '#ffcb6b',
    error: '#ff5370',
    success: '#c3e88d',
    brown: '#f78c6c',
    toggleOn: '#89ddff',
  },
  // Palenight — Material's softer indigo variant.
  palenight: {
    bg: '#292d3e',
    user: '#82aaff',
    userBar: '#4b5f8f',
    turnRule: '#353a52',
    turnLabel: '#676e95',
    prompt: '#ffcb6b',
    dir: '#89ddff',
    assistant: '#a6accd',
    tool: '#f78c6c',
    toolResult: '#8f97bd',
    system: '#7e87b3',
    dim: '#676e95',
    taskSummary: '#c792ea',
    warn: '#ffcb6b',
    error: '#ff5370',
    success: '#c3e88d',
    brown: '#f78c6c',
    toggleOn: '#89ddff',
  },
  // Zenburn — the low-contrast classic from Vim.
  zenburn: {
    bg: '#3f3f3f',
    user: '#8cd0d3',
    userBar: '#5d8d8f',
    turnRule: '#4a4a4a',
    turnLabel: '#7f9f7f',
    prompt: '#e3ceab',
    dir: '#8cd0d3',
    assistant: '#dcdccc',
    tool: '#dfaf8f',
    toolResult: '#a8a8a0',
    system: '#909090',
    dim: '#7f9f7f',
    taskSummary: '#93e0e3',
    warn: '#e3ceab',
    error: '#cc9393',
    success: '#7f9f7f',
    brown: '#dfaf8f',
    toggleOn: '#93e0e3',
  },
  // Selenized Dark — a modern, contrast-checked Solarized rework.
  selenized: {
    bg: '#103c48',
    user: '#4695f7',
    userBar: '#2e6aa8',
    turnRule: '#184956',
    turnLabel: '#72898f',
    prompt: '#dbb32d',
    dir: '#41c7b9',
    assistant: '#adbcbc',
    tool: '#ed8649',
    toolResult: '#8a9ea3',
    system: '#8a9ea3',
    dim: '#72898f',
    taskSummary: '#41c7b9',
    warn: '#dbb32d',
    error: '#fa5750',
    success: '#75b938',
    brown: '#ed8649',
    toggleOn: '#41c7b9',
  },
  // Iceberg — a calm blue "ice" scheme for Neovim/VS Code.
  iceberg: {
    bg: '#161821',
    user: '#84a0c6',
    userBar: '#4f6a8f',
    turnRule: '#1e2132',
    turnLabel: '#6b7089',
    prompt: '#e2a478',
    dir: '#89b8c2',
    assistant: '#c6c8d1',
    tool: '#e2a478',
    toolResult: '#9aa3bd',
    system: '#8389a3',
    dim: '#6b7089',
    taskSummary: '#a093c7',
    warn: '#e2a478',
    error: '#e27878',
    success: '#b4be82',
    brown: '#e2a478',
    toggleOn: '#89b8c2',
  },
  // Sonokai — a vivid, modern take on Monokai.
  sonokai: {
    bg: '#2c2e34',
    user: '#76cce0',
    userBar: '#42808f',
    turnRule: '#3b3e48',
    turnLabel: '#7f8490',
    prompt: '#e7c664',
    dir: '#76cce0',
    assistant: '#e2e2e3',
    tool: '#f39660',
    toolResult: '#a6a7ad',
    system: '#9da0a7',
    dim: '#7f8490',
    taskSummary: '#9ed072',
    warn: '#e7c664',
    error: '#fc5d7c',
    success: '#9ed072',
    brown: '#f39660',
    toggleOn: '#76cce0',
  },
  // Aurora — a northern-lights violet scheme.
  aurora: {
    bg: '#191c27',
    user: '#88c0d0',
    userBar: '#4b7180',
    turnRule: '#242836',
    turnLabel: '#6a6f8c',
    prompt: '#ebcb8b',
    dir: '#88c0d0',
    assistant: '#d8dee9',
    tool: '#d08770',
    toolResult: '#9aa3b8',
    system: '#8891a8',
    dim: '#6a6f8c',
    taskSummary: '#b48ead',
    warn: '#ebcb8b',
    error: '#bf616a',
    success: '#a3be8c',
    brown: '#d08770',
    toggleOn: '#8fbcbb',
  },
  // Cobalt2 — Wes Bos's saturated blue VS Code theme.
  cobalt2: {
    bg: '#193549',
    user: '#9effff',
    userBar: '#4d8f9e',
    turnRule: '#1f4662',
    turnLabel: '#7a8f9e',
    prompt: '#ffc600',
    dir: '#9effff',
    assistant: '#e1efff',
    tool: '#ff9d00',
    toolResult: '#a6b8c8',
    system: '#8ba0b3',
    dim: '#7a8f9e',
    taskSummary: '#0088ff',
    warn: '#ffc600',
    error: '#ff628c',
    success: '#3ad900',
    brown: '#ff9d00',
    toggleOn: '#80ffbb',
  },
  // Kanagawa — Hokusai-inspired muted indigo (the "wave" theme).
  kanagawa: {
    bg: '#1f1f28',
    user: '#7e9cd8',
    userBar: '#55709e',
    turnRule: '#2a2a37',
    turnLabel: '#727169',
    prompt: '#e6c384',
    dir: '#7fb4ca',
    assistant: '#dcd7ba',
    tool: '#ffa066',
    toolResult: '#a6a69c',
    system: '#c8c093',
    dim: '#727169',
    taskSummary: '#957fb8',
    warn: '#e6c384',
    error: '#e46876',
    success: '#98bb6c',
    brown: '#d27e59',
    toggleOn: '#7aa89f',
  },
}

/** The palette id used when the configured theme is unknown/missing. */
export const DEFAULT_THEME: ThemeName = 'zames'

/**
 * True for a palette id we actually ship. Used by the config layer to
 * normalize `ui.theme` (a stale value from an older/newer build must not
 * leave the operator with an unstyled terminal).
 */
export function isThemeName(v: unknown): v is ThemeName {
  return (
    typeof v === 'string' && Object.prototype.hasOwnProperty.call(PALETTES, v)
  )
}

/** All palette ids, in the order they are offered in /config. */
export function themeNames(): ThemeName[] {
  return Object.keys(PALETTES) as ThemeName[]
}

export interface Theme {
  [role: string]: ChalkInstance
}

/** Build the chalk formatters for one palette. */
function buildTheme(p: Palette): Theme {
  return {
    user: chalk.hex(p.user),
    userBar: chalk.hex(p.userBar),
    turnRule: chalk.hex(p.turnRule),
    turnLabel: chalk.hex(p.turnLabel),
    prompt: chalk.hex(p.prompt).bold,
    dir: chalk.hex(p.dir),
    assistant: chalk.hex(p.assistant),
    tool: chalk.hex(p.tool),
    toolResult: chalk.hex(p.toolResult),
    system: chalk.hex(p.system),
    dim: chalk.hex(p.dim),
    taskSummary: chalk.hex(p.taskSummary),
    warn: chalk.hex(p.warn),
    error: chalk.hex(p.error),
    success: chalk.hex(p.success),
    brown: chalk.hex(p.brown),
    toggleOn: chalk.hex(p.toggleOn),
    bold: chalk.bold,
  }
}

// The LIVE theme object. It is mutated IN PLACE by applyTheme() so that every
// module that captured the import (`import { theme } from './theme.js'`) sees
// the switch without being re-imported — this is why the call sites read
// `theme.x` at RENDER time instead of destructuring a color at module load.
let activeName: ThemeName = DEFAULT_THEME
export const theme: Theme = buildTheme(PALETTES[DEFAULT_THEME])

/** The palette id currently rendered. */
export function currentThemeName(): ThemeName {
  return activeName
}

/**
 * Switch the palette for every subsequent render. Unknown ids fall back to the
 * default so a hand-edited config can never blank out the colors.
 * Returns the id actually applied.
 */
export function applyTheme(name: unknown): ThemeName {
  const next = isThemeName(name) ? name : DEFAULT_THEME
  const built = buildTheme(PALETTES[next])
  for (const key of Object.keys(built)) {
    theme[key] = built[key]
  }
  activeName = next
  // The window background is part of the look: paint it (best effort) so a
  // dark palette does not sit on a light terminal background.
  applyBackground(next)
  return next
}

/**
 * The active palette's RAW hex map — for the Ink TUI, which needs color
 * STRINGS (Ink `<Text color>` does not take chalk functions) and for the
 * README screenshot generator, which renders the real colors as HTML.
 */
export function themeColors(): Palette {
  return PALETTES[activeName]
}

// Horizontal rule that separates the model's answer from the next block. It
// spans the SHARED content width (src/width.ts) so the rule, the answers and
// the tool previews all line up at the same margin. The `max` argument is kept
// for a shorter rule in special call sites; by default it is the content width.
export function divider(max?: number): string {
  const width = max && max > 0 ? Math.min(max, contentWidth()) : contentWidth()
  return '─'.repeat(width)
}

export default theme
