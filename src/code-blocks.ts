// PURE extraction of fenced code blocks from a Markdown answer.
//
// The TUI cannot offer a real "copy button", so copying a code block is bound
// to a key / command. That needs the RAW fenced text (the highlighted render is
// full of ANSI and must NOT be copied), which is what this module returns.
// Kept pure so it is unit-tested without a terminal.

export interface CodeBlock {
  /** The info string after the opening fence (e.g. "ts"), '' when absent. */
  lang: string
  /** The raw code text, WITHOUT the fence lines. */
  text: string
  /** 1-based position among the blocks of ONE answer. */
  index: number
}

/**
 * Extract every fenced code block (``` or ~~~) from `md`, in order. Handles a
 * longer closing fence than the opening one and an unterminated final block
 * (the answer was truncated) — a half block is still copyable.
 */
export function extractCodeBlocks(md: string): CodeBlock[] {
  const lines = String(md ?? '').split(String.fromCharCode(10))
  const out: CodeBlock[] = []
  let i = 0
  let n = 0
  while (i < lines.length) {
    // The info string may contain a BACKTICK (CommonMark forbids it, models
    // write it anyway: ```` ```ts` ````, ```` ```c++ `std::vector` ````). The
    // old `[^`]*` rejected such a line, so the block's own CLOSING fence was
    // read as an OPENING one and the following prose became a bogus block.
    const m = /^(\s*)(`{3,}|~{3,})\s*(.*)$/.exec(lines[i])
    if (!m) {
      i++
      continue
    }
    // A BACKTICK fence cannot carry a backtick in its info (that is what makes
    // it unparseable for CommonMark); treat the trailing text as prose after a
    // plain fence only when the line is exactly a fence. For our purpose the
    // pragmatic rule is: any trailing text is the language label, backticks
    // stripped.
    const fence = m[2]
    const marker = fence[0]
    const minLen = fence.length
    const lang = (m[3] || '').replace(/`/g, '').trim()
    i++
    const body: string[] = []
    let closed = false
    while (i < lines.length) {
      // A closing fence is the SAME marker, at least as long, with nothing
      // else on the line (whitespace allowed).
      const c = new RegExp('^\\s*' + marker + '{' + minLen + ',}\\s*$')
      if (c.test(lines[i])) {
        closed = true
        i++
        break
      }
      body.push(lines[i])
      i++
    }
    if (body.length === 0 && closed) continue
    n++
    out.push({ lang, text: body.join(String.fromCharCode(10)), index: n })
  }
  return out
}
