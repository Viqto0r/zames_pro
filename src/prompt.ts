// Terminal line input with correct paste handling (Shift+Insert,
// Ctrl+Shift+V, right mouse button, etc.).
//
// Why a custom reader instead of readline:
//   1) readline submits the line on the FIRST newline. When pasting
//      multiline text this caused immediate submission and only the first
//      line went to the chat. Here newlines inside a paste are replaced with
//      spaces, and submission happens only on a single Enter press.
//   2) We enable bracketed paste mode (\x1b[?2004h): the terminal wraps the
//      pasted text in the markers \x1b[200~ … \x1b[201~, so we know for sure
//      that this is a paste, not keyboard typing, and Enter inside it is not
//      treated as submission.
export async function promptOnce(question: string): Promise<string> {
  const stdin = process.stdin
  const stdout = process.stdout

  // Non-TTY (pipe, redirect): read everything up to EOF as a single string.
  if (!stdin.isTTY || !stdin.setRawMode) {
    const chunks: Buffer[] = []
    return await new Promise((resolve) => {
      const onData = (b: Buffer) => chunks.push(b)
      const onEnd = () => {
        stdin.removeListener('data', onData)
        stdin.removeListener('end', onEnd)
        resolve(Buffer.concat(chunks).toString('utf-8'))
      }
      stdin.on('data', onData)
      stdin.on('end', onEnd)
      stdin.resume()
    })
  }

  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)
  stdin.resume()

  // We enable/disable bracketed paste in pairs.
  stdout.write('\x1b[?2004h')
  stdout.write(question)

  let line = ''
  let cursor = 0
  let inPaste = false
  const PASTE_START = '\x1b[200~'
  const PASTE_END = '\x1b[201~'

  const redraw = () => {
    // Return to the start of the line, erase and print again.
    stdout.write(String.fromCharCode(13))
    stdout.write('\x1b[K')
    stdout.write(question + line)
    // Put the cursor in the right position.
    const back = line.length - cursor
    if (back > 0) stdout.write('\x1b[' + back + 'D')
  }

  return await new Promise((resolve) => {
    const finish = (value: string, submit: boolean) => {
      stdin.removeListener('data', onData)
      stdout.write('\x1b[?2004l')
      if (stdin.setRawMode) stdin.setRawMode(wasRaw || false)
      if (submit) stdout.write(String.fromCharCode(10))
      resolve(value)
    }

    const insertText = (text: string) => {
      // Normalize newlines: they come from a multiline paste but mean
      // "submit". Inside the message we replace them with a space so the
      // whole paste goes as ONE message.
      const clean = text
        .replace(/\r\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\n/g, ' ')
      line = line.slice(0, cursor) + clean + line.slice(cursor)
      cursor += clean.length
    }

    const onData = (buf: Buffer) => {
      let s = buf.toString('utf-8')

      // Fallback for terminals without bracketed paste: if the whole chunk is
      // a "bare" newline (one byte), then Enter was pressed → submit.
      // If newlines came TOGETHER with other text in one chunk — that's a
      // paste; such newlines don't submit the message but are replaced with
      // spaces (see insertText).
      if (!inPaste && (s === '\r' || s === '\n')) {
        return finish(line, true)
      }

      while (s.length) {
        if (inPaste) {
          const end = s.indexOf(PASTE_END)
          if (end === -1) {
            insertText(s)
            s = ''
          } else {
            insertText(s.slice(0, end))
            s = s.slice(end + PASTE_END.length)
            inPaste = false
          }
          redraw()
          continue
        }

        const start = s.indexOf(PASTE_START)
        if (start !== -1) {
          // Everything before the marker is processed as regular input.
          const before = s.slice(0, start)
          s = s.slice(start + PASTE_START.length)
          inPaste = true
          if (before) {
            for (const ch of before) {
              if (ch === '\r' || ch === '\n') {
                /* inside a paste — skip */
              } else insertText(ch)
            }
            redraw()
          }
          continue
        }

        const ch = s[0]
        const code = s.charCodeAt(0)
        s = s.slice(1)

        if (ch === '\r' || ch === '\n') {
          // A newline inside a chunk with other text (paste without
          // bracketed paste): don't submit, insert a space instead.
          insertText(' ')
          redraw()
          continue
        }
        if (code === 3) {
          // Ctrl+C — abort input.
          return finish('', true)
        }
        if (code === 4) {
          // Ctrl+D — like submitting an empty line.
          return finish(line, true)
        }
        if (code === 21) {
          // Ctrl+U — erase the line.
          line = ''
          cursor = 0
          redraw()
          continue
        }
        if (code === 127 || code === 8) {
          // Backspace.
          if (cursor > 0) {
            line = line.slice(0, cursor - 1) + line.slice(cursor)
            cursor--
            redraw()
          }
          continue
        }
        if (ch === '\x1b') {
          // Escape sequences (arrows, Home/End, Delete…).
          const rest = s
          if (rest.startsWith('[D')) {
            if (cursor > 0) cursor--
            s = s.slice(2)
            redraw()
            continue
          }
          if (rest.startsWith('[C')) {
            if (cursor < line.length) cursor++
            s = s.slice(2)
            redraw()
            continue
          }
          if (rest.startsWith('[H') || rest.startsWith('[1~')) {
            cursor = 0
            s = s.slice(rest.startsWith('[1~') ? 3 : 2)
            redraw()
            continue
          }
          if (rest.startsWith('[F') || rest.startsWith('[4~')) {
            cursor = line.length
            s = s.slice(rest.startsWith('[4~') ? 3 : 2)
            redraw()
            continue
          }
          if (rest.startsWith('[3~')) {
            // Delete.
            if (cursor < line.length) {
              line = line.slice(0, cursor) + line.slice(cursor + 1)
              redraw()
            }
            s = s.slice(3)
            continue
          }
          // Other ESC sequences are skipped up to a letter/tilde.
          const m = s.match(/^\[[0-9;]*[A-Za-z~]/)
          if (m) s = s.slice(m[0].length)
          continue
        }
        if (code < 32) continue // other control characters are ignored

        insertText(ch)
        redraw()
      }
    }

    stdin.on('data', onData)
  })
}
