import { spawn } from 'node:child_process'

// N37 statusLine hook. When `ui.statusLineCommand` is set, zames runs it on a
// timer with a JSON status object on stdin and shows the FIRST line of its
// stdout in the status line (like Claude Code). The command is deliberately
// run OUT of the render path: a per-render spawn would block typing, so the
// caller runs it on its own interval and only sets the resulting text.
//
// Best-effort: a missing/failing command yields an empty string (the badge is
// hidden), never an error in the UI.

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
      resolve(first)
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {}
      finish()
    }, timeoutMs)
    child.stdout?.on('data', (c: Buffer) => {
      out += c.toString()
    })
    child.on('error', () => {
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
