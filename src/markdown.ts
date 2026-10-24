import { render } from 'markdansi'
import { highlight } from 'cli-highlight'
import supportsHyperlinks from 'supports-hyperlinks'

// Renders the model's Markdown answers to the terminal via markdansi (GFM plus
// code highlighting), with a theme built from the project's calm palette.

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

const theme: MdTheme = {
  heading: { color: '#9fb8d8', bold: true },
  strong: { color: '#e6e0cc', bold: true },
  emph: { color: '#cfc9b0', italic: true },
  inlineCode: { color: '#9ecb9e' },
  blockCode: { color: '#c9d1c9' },
  code: { color: '#9ecb9e' },
  link: { color: '#8fb8d8', underline: true },
  quote: { color: '#8a8f9a', italic: true },
  hr: { color: '#5b616e' },
  listMarker: { color: '#8a9bb5' },
  tableHeader: { color: '#9fb8d8', bold: true },
  tableCell: { color: '#d0d0d0' },
}

function highlighter(code: string, lang?: string): string {
  try {
    return highlight(code, {
      language: lang || 'plaintext',
      ignoreIllegals: true,
    })
  } catch {
    return code
  }
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
      theme: theme as unknown as Parameters<typeof render>[1] extends
        { theme?: infer T } | undefined
        ? T
        : never,
      highlighter,
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

export default renderMarkdown
