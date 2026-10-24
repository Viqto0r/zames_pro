import { spawn } from 'node:child_process'

// statusLine hook. When `ui.statusLineCommand` is set, zames runs it on a
// timer with a JSON status object on stdin and shows the FIRST line of its
// stdout in the status line (like Claude Code). The command is deliberately
// run OUT of the render path: a per-render spawn would block typing, so the
// caller runs it on its own interval and only sets the resulting text.
//
// Best-effort: a missing/failing command yields an empty string (the badge is
// hidden), never an error in the UI.

// Longest status text that still fits a typical terminal row together with
// the rest of the status bar.
export const STATUS_BADGE_MAX = 80

/** Clip a status badge to STATUS_BADGE_MAX with an ellipsis (never splits a
 *  surrogate pair). */
export function clipBadge(text: string, max = STATUS_BADGE_MAX): string {
  const s = String(text ?? '')
  if (s.length <= max) return s
  let cut = max - 1
  const c = s.charCodeAt(cut - 1)
  if (c >= 0xd800 && c <= 0xdbff) cut--
  return s.slice(0, cut) + '…'
}

export interface StatusLineInfo {
  chatId: string | null
  queueLength: number
  tokens: number | null
  contextLimit: number
  tasks: string
  locale: string
}

/** Run the statusLine command and return its first stdout line (trimmed). */
export function runStatusLineCommand(
  workdir: string,
  command: string,
  info: StatusLineInfo,
  timeoutMs = 4000,
): Promise<string> {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, {
        cwd: workdir,
        shell:
          process.platform === 'win32'
            ? process.env.ComSpec || true
            : '/bin/sh',
        windowsHide: true,
        env: { ...process.env },
        // Own process group so the timeout can kill the WHOLE tree. A command
        // that backgrounds a child (a watcher, `npm run dev &`) leaves the
        // grandchild holding our stdout pipe: killing only the shell kept
        // 'close' from firing, so the promise stayed pending and the badge
        // stopped updating on every tick.
        detached: process.platform !== 'win32',
      })
    } catch {
      resolve('')
      return
    }
    let out = ''
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      const first = String(out).split(/\r?\n/)[0].trim()
      // The status line is rendered as ONE row, unwrapped. A command that
      // prints a long single line must not push 400 raw columns into it
      // (the row overflows and the cursor arithmetic drifts).
      resolve(clipBadge(first))
    }
    // Only the FIRST LINE is shown, so there is no reason to keep collecting a
    // big blob: a chatty command (a JSON dump, `ls -R`) would grow `out`
    // unboundedly and the status row then repainted megabytes. Stop appending
    // once a short line is buffered (the rest of that line does not matter).
    const timer = setTimeout(() => {
      try {
        if (process.platform !== 'win32' && child.pid) {
          process.kill(-child.pid, 'SIGKILL')
        } else {
          child.kill()
        }
      } catch {}
      finish()
    }, timeoutMs)
    // A status line is a short badge: cap what is buffered so a chatty
    // command cannot grow it (and the rendered row) without bound.
    const MAX_OUT = 400
    child.stdout?.on('data', (c: Buffer) => {
      if (out.length >= MAX_OUT) return
      // A chunk can be huge (one 64 KB read); clip it to the remaining space
      // so the buffer never exceeds MAX_OUT. An unbounded `out` made the
      // status row repaint megabytes on every tick.
      out += c.toString().slice(0, MAX_OUT - out.length)
    })
    child.on('error', () => {
      clearTimeout(timer)
      finish()
    })
    // 'end' on OUR stdout fires as soon as the writer closes the pipe. 'close'
    // waits for the pipes to drain, so a command that backgrounds a daemon (a
    // watcher, `npm run dev &`) — whose grandchild inherits the pipe — kept the
    // promise pending until the 4s timeout on EVERY tick even though the line
    // had already been printed.
    child.stdout?.on('end', () => {
      clearTimeout(timer)
      finish()
    })
    child.on('close', () => {
      clearTimeout(timer)
      finish()
    })
    if (child.stdin) {
      child.stdin.on('error', () => {})
      child.stdin.end(JSON.stringify(info) + String.fromCharCode(10))
    }
  })
}
