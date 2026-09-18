import { render } from 'markdansi'
import { highlight } from 'cli-highlight'

// Рендер Markdown-ответов модели в терминал через markdansi.
// GFM (заголовки, списки, таблицы, цитаты, task lists) + подсветка кода.
// Тема собрана из нашей спокойной палитры, без кислотных цветов.

const theme = {
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

// Подсветка кода через cli-highlight (транзитивно уже есть у нас).
function highlighter(code, lang) {
  try {
    return highlight(code, { language: lang || 'plaintext', ignoreIllegals: true })
  } catch {
    return code
  }
}

export function renderMarkdown(text) {
  if (!text) return ''
  try {
    return render(String(text), {
      width: Math.min(process.stdout.columns || 80, 100),
      theme,
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
