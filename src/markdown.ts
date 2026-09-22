import { render } from 'markdansi'
import { highlight } from 'cli-highlight'

// Renders the model's Markdown answers to the terminal via markdansi.
// GFM (headings, lists, tables, quotes, task lists) + code highlighting.
// The theme is built from our calm palette, without acid colors.

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

// Code highlighting via cli-highlight (already present transitively).
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

export function renderMarkdown(text: string): string {
  if (!text) return ''
  try {
    return render(String(text), {
      width: Math.min(process.stdout.columns || 80, 100),
      theme: theme as unknown as Parameters<typeof render>[1] extends
        | { theme?: infer T }
        | undefined
        ? T
        : never,
      highlighter,
      codeBox: true,
      tableBorder: 'unicode',
      listIndent: 2,
      hyperlinks: false,
    })
  } catch {
    return String(text)
  }
}

export default renderMarkdown
