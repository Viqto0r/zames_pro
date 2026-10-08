import { exec, execFile, type ExecOptions } from 'child_process'
import path from 'path'
import os from 'os'

// Shared shell runner for the Bash tool and the operator's `!command` escape.
// Kept in its own module so both call sites use the SAME sandbox guard and the
// SAME abort wiring; a second, ad-hoc runner would drift from the real one.

// Sandbox (option A): don't let a shell command go above the project root.
// This is a protective barrier, not full OS isolation.
export function assertCommandInsideRoot(root: string, command: string): void {
  const cmd = String(command || '')

  // eval re-parses its argument, so a `cd` hidden inside a string is invisible
  // to the static scan; refusing eval together with cd is the honest answer
  // instead of pretending the barrier still holds.
  if (/\beval\b/.test(cmd) && /\bcd\b/.test(cmd)) {
    throw new Error('Sandbox: eval with cd is forbidden')
  }

  // `(` and backticks open a subshell / command substitution where a `cd` is
  // still executed; include them in the prefix so the scan sees it.
  const cdRe = /(?:^|[;&|(\s`])(?:cd|pushd)\s+([^;&|)]+)/gi
  let m
  while ((m = cdRe.exec(cmd))) {
    const raw = m[1].trim().replace(/^["']|["']$/g, '')
    if (!raw || raw === '-') continue
    // sh expands ~ and $HOME AFTER this check, so expand them here as well —
    // otherwise `cd ~` passes the guard and then leaves the root.
    const expanded = raw
      .replace(/^~(?=$|[/\\])/, os.homedir())
      .replace(/\$\{?HOME\}?/g, os.homedir())
    const target = path.resolve(root, expanded)
    const rel = path.relative(root, target)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(
        'Sandbox: leaving ' + root + ' is forbidden (cd ' + raw + ')',
      )
    }
  }
}

function formatExecResult(
  err:
    | (Error & { code?: number | string; killed?: boolean; signal?: string })
    | null,
  stdout: string | Buffer,
  stderr: string | Buffer,
  timeout: number,
  okExitCodes: number[],
): string {
  const out = (stdout || '').toString()
  const errStr = (stderr || '').toString()

  if (
    !err ||
    (typeof err.code === 'number' && okExitCodes.includes(err.code))
  ) {
    const combined = (out + errStr).trim()
    return combined || '(command produced no output)'
  }

  const parts = []

  if (err.killed) {
    parts.push('\u23f1 Timeout after ' + timeout + 'ms \u2014 process killed.')
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

  return parts.join('\n')
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
      resolve(formatExecResult(err as never, stdout, stderr, timeout, []))
    })
  })
}

// Run an executable directly with an argument ARRAY (no shell). Use this
// whenever an argument comes from the model: the shell never sees it, so
// $(...), backticks and quotes cannot be interpreted as commands.
export function runFile(
  workdir: string,
  file: string,
  args: string[],
  timeout = 30_000,
  signal?: AbortSignal,
  okExitCodes: number[] = [],
): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        cwd: workdir,
        timeout,
        maxBuffer: 1024 * 1024 * 8,
        windowsHide: true,
        env: { ...process.env },
        signal,
      },
      (err, stdout, stderr) => {
        resolve(
          formatExecResult(err as never, stdout, stderr, timeout, okExitCodes),
        )
      },
    )
  })
}
