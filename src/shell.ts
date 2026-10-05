import { exec, type ExecOptions } from 'child_process'
import path from 'path'

// Shared shell runner for the Bash tool and the operator's `!command` escape.
// Kept in its own module so both call sites use the SAME sandbox guard and the
// SAME abort wiring; a second, ad-hoc runner would drift from the real one.

// Sandbox (option A): don't let a shell command go above the project root.
// This is a protective barrier, not full OS isolation.
export function assertCommandInsideRoot(root: string, command: string): void {
  const cmd = String(command || '')
  const cdRe = /(?:^|[;&|]|\s)(?:cd|pushd)\s+([^;&|]+)/gi
  let m
  while ((m = cdRe.exec(cmd))) {
    const raw = m[1].trim()
    if (!raw || raw === '-') continue
    const target = path.resolve(root, raw)
    const rel = path.relative(root, target)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(
        'Sandbox: leaving ' + root + ' is forbidden (cd ' + raw + ')',
      )
    }
  }
}

export function runShell(
  workdir: string,
  command: string,
  timeout = 30_000,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve) => {
    const options: ExecOptions = {
      cwd: workdir,
      timeout,
      maxBuffer: 1024 * 1024 * 8,
      windowsHide: true,
      env: { ...process.env },
      // Abort the child process when the operator pressed Esc/Ctrl+C.
      // Without it a long `npm test` kept running even after the stop.
      signal,
    }

    if (process.platform === 'win32') {
      options.shell = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
    } else {
      options.shell = '/bin/sh'
    }

    exec(command, options, (err, stdout, stderr) => {
      const out = (stdout || '').toString()
      const errStr = (stderr || '').toString()

      if (!err) {
        const combined = (out + errStr).trim()
        resolve(combined || '(command produced no output)')
        return
      }

      const parts = []

      if (err.killed) {
        parts.push(
          '\u23f1 Timeout after ' + timeout + 'ms \u2014 process killed.',
        )
      } else if ((err as { code?: string }).code === 'ABORT_ERR') {
        parts.push('(aborted by the operator)')
      } else if (err.code !== undefined && err.code !== null) {
        parts.push('Exit code: ' + err.code)
      } else if (err.signal) {
        parts.push('Killed by signal: ' + err.signal)
      } else {
        parts.push('Error: ' + err.message)
      }

      if (out.trim()) parts.push('stdout:\n' + out.trim())
      if (errStr.trim()) parts.push('stderr:\n' + errStr.trim())

      resolve(parts.join('\n'))
    })
  })
}
