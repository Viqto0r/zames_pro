import { render } from 'markdansi'
import {
  highlight,
  DEFAULT_THEME as HL_DEFAULT_THEME,
  plain,
  type Theme as HlTheme,
} from 'cli-highlight'
import supportsHyperlinks from 'supports-hyperlinks'
import { themeColors, type Palette } from './theme.js'

// Renders the model's Markdown answers to the terminal via markdansi (GFM plus
// code highlighting), with a theme derived from the ACTIVE palette
// (src/theme.ts) — so a /theme switch repaints the answers too, not only the
// UI chrome.

interface MdTheme {
  heading: { color: string; bold: boolean }
  strong: { color: string; bold: boolean }
  emph: { color: string; italic: boolean }
  inlineCode: { color: string }
  blockCode: { color: string }
  code: { color: string }
  link: { color: string; underline: boolean }
  quote: { color: string; italic: boolean }
  hr: { color: string }
  listMarker: { color: string }
  tableHeader: { color: string; bold: boolean }
  tableCell: { color: string }
}

/**
 * The Markdown theme for one palette. Rebuilt on every render (it is cheap) so
 * the answers follow a live theme switch; the module no longer freezes the
 * colors at import time.
 */
function mdTheme(p: Palette): MdTheme {
  return {
    heading: { color: p.taskSummary, bold: true },
    strong: { color: p.assistant, bold: true },
    emph: { color: p.assistant, italic: true },
    inlineCode: { color: p.success },
    blockCode: { color: p.toolResult },
    code: { color: p.success },
    link: { color: p.dir, underline: true },
    quote: { color: p.system, italic: true },
    hr: { color: p.dim },
    listMarker: { color: p.tool },
    tableHeader: { color: p.taskSummary, bold: true },
    tableCell: { color: p.assistant },
  }
}

/**
 * Syntax highlighting for a code block, mapped onto the palette. Without this
 * the highlighter used cli-highlight's DEFAULT_THEME (chalk's blue/red/green),
 * which ignores the selected theme entirely and looked off in every non-zames
 * palette. Tokens we do not map fall back to `plain` — NOT to the default
 * theme — so nothing outside the palette can leak in.
 */
function hlTheme(p: Palette): HlTheme {
  return {
    keyword: (s) => wrap(p.prompt, s),
    built_in: (s) => wrap(p.tool, s),
    type: (s) => wrap(p.taskSummary, s),
    literal: (s) => wrap(p.prompt, s),
    number: (s) => wrap(p.success, s),
    regexp: (s) => wrap(p.error, s),
    string: (s) => wrap(p.success, s),
    comment: (s) => wrap(p.dim, s),
    class: (s) => wrap(p.taskSummary, s),
    function: (s) => wrap(p.dir, s),
    title: (s) => wrap(p.dir, s),
    params: (s) => wrap(p.assistant, s),
    attr: (s) => wrap(p.tool, s),
    variable: (s) => wrap(p.assistant, s),
    doctag: (s) => wrap(p.system, s),
    meta: (s) => wrap(p.system, s),
    tag: (s) => wrap(p.prompt, s),
    name: (s) => wrap(p.prompt, s),
    section: (s) => wrap(p.taskSummary, s),
    link: (s) => wrap(p.dir, s),
    addition: (s) => wrap(p.success, s),
    deletion: (s) => wrap(p.error, s),
  }
}

/** Apply a palette color to a highlighted token. */
function wrap(hex: string, s: string): string {
  return '\x1b[38;2;' + rgb(hex) + 'm' + s + '\x1b[39m'
}

/** `#rrggbb` -> the `r;g;b` part of a truecolor SGR sequence. */
function rgb(hex: string): string {
  const h = hex.replace('#', '')
  return (
    parseInt(h.slice(0, 2), 16) +
    ';' +
    parseInt(h.slice(2, 4), 16) +
    ';' +
    parseInt(h.slice(4, 6), 16)
  )
}

// The answer width is the SHARED content width (src/width.ts), the same one
// the operator's echoed text, the tool previews, the warnings and the divider
// use — so nothing is rendered at a different margin. `setAnswerWidth` is kept
// as a thin alias for callers that still use the old name.
import { contentWidth, setContentWidth } from './width.js'

export function setAnswerWidth(width: number): void {
  setContentWidth(width)
}

export function renderMarkdown(text: string): string {
  if (!text) return ''
  // NO_COLOR (https://no-color.org) is the ONE color opt-out. markdansi
  // builds its OWN Chalk instance, so the `chalk.level = 0` that theme.ts
  // sets for NO_COLOR never reaches it; without this guard the answers would
  // stay colored while everything else went plain.
  if (process.env.NO_COLOR) return String(text)
  const p = themeColors()
  try {
    const width = contentWidth()
    return render(String(text), {
      width,
      // markdansi infers color support itself (`process.stdout.isTTY`), so
      // under a non-TTY stdout — a piped answer, `--json`, a test — it emitted
      // PLAIN text and the whole theme below was silently unused (answers
      // looked unformatted). `color: true` makes it always emit SGR; the ONE
      // opt-out is NO_COLOR, handled above.
      color: true,
      theme: mdTheme(p) as unknown as Parameters<typeof render>[1] extends
        { theme?: infer T } | undefined
        ? T
        : never,
      highlighter: (code, lang) =>
        highlight(code, {
          language: lang || 'plaintext',
          ignoreIllegals: true,
          theme: hlTheme(p),
        }),
      codeBox: true,
      tableBorder: 'unicode',
      listIndent: 2,
      // OSC-8 hyperlinks: the URL disappears into a clickable label. Only
      // when the terminal advertises support — otherwise the raw URL is
      // printed, which is the safer default for a log that may be piped.
      hyperlinks: supportsHyperlinks.stdout,
    })
  } catch {
    return String(text)
  }
}

// Keep the import meaningful for tree-shakers/readers: the default theme is
// deliberately NOT used (see hlTheme), `plain` is the fallback contract.
void HL_DEFAULT_THEME
void plain

export default renderMarkdown
