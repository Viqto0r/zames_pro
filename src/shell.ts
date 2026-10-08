import { exec, execFile, spawn, type ExecOptions } from 'child_process'
import path from 'path'
import os from 'os'
import { randomBytes } from 'crypto'

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

// ---------- background processes (N33) ----------
//
// A dev-server / watch / long build cannot be run through the blocking Bash
// tool (it would sit until the timeout). These helpers start a command, keep
// it in a registry keyed by a short id, and let BashOutput poll its output and
// kill it. Output is buffered in memory (bounded) so a chatty server does not
// grow without limit.

interface BgProc {
  id: string
  command: string
  child: ReturnType<typeof spawn>
  out: string
  status: 'running' | 'exited'
  code: number | null
  signal: NodeJS.Signals | null
  startedAt: number
}

const BG_PROCS = new Map<string, BgProc>()
const BG_MAX_BUFFER = 1024 * 1024

function bgTrim(p: BgProc): void {
  if (p.out.length > BG_MAX_BUFFER) {
    p.out =
      '[...earlier output trimmed]' +
      String.fromCharCode(10) +
      p.out.slice(p.out.length - BG_MAX_BUFFER)
  }
}

/** Start a shell command in the background. Returns a short id. */
export function startBackground(workdir: string, command: string): string {
  const id = randomBytes(3).toString('hex')
  const shellCmd =
    process.platform === 'win32'
      ? process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
      : '/bin/sh'
  const child = spawn(shellCmd, ['-c', command], {
    cwd: workdir,
    windowsHide: true,
    env: { ...process.env },
    // Own process group so a kill reaches children (a dev server spawns more).
    detached: process.platform !== 'win32',
  })
  const proc: BgProc = {
    id,
    command,
    child,
    out: '',
    status: 'running',
    code: null,
    signal: null,
    startedAt: Date.now(),
  }
  const append = (chunk: Buffer | string): void => {
    proc.out += chunk.toString()
    bgTrim(proc)
  }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  child.on('exit', (code, signal) => {
    proc.status = 'exited'
    proc.code = code
    proc.signal = signal
    proc.out += `\n[exited code=${code} signal=${signal}]`
    bgTrim(proc)
  })
  child.on('error', (err) => {
    proc.status = 'exited'
    proc.out += `\n[error: ${err.message}]`
  })
  BG_PROCS.set(id, proc)
  return id
}

/** Read the accumulated output of a background process (and its status). */
export function pollBackground(id: string): string {
  const p = BG_PROCS.get(id)
  if (!p) return `No background process with id ${id}.`
  const head =
    '[' +
    id +
    ' ' +
    p.status +
    (p.status === 'exited' ? ' code=' + p.code : '') +
    '] ' +
    p.command
  const body = p.out.trim() || '(no output yet)'
  return head + String.fromCharCode(10) + body
}

/** Kill a background process (its whole group on POSIX). */
export function killBackground(id: string): string {
  const p = BG_PROCS.get(id)
  if (!p) return `No background process with id ${id}.`
  if (p.status === 'exited')
    return `Process ${id} already exited (code=${p.code}).`
  try {
    if (process.platform !== 'win32' && p.child.pid) {
      process.kill(-p.child.pid, 'SIGTERM')
    } else {
      p.child.kill('SIGTERM')
    }
  } catch (e) {
    return `Failed to kill ${id}: ${(e as Error).message}`
  }
  BG_PROCS.delete(id)
  return `Killed background process ${id}.`
}

/** List running background processes (for /status and cleanup). */
export function listBackground(): Array<{ id: string; command: string }> {
  return [...BG_PROCS.values()]
    .filter((p) => p.status === 'running')
    .map((p) => ({ id: p.id, command: p.command }))
}

/** Kill every background process — called on exit so no orphan survives. */
export function killAllBackground(): void {
  for (const id of [...BG_PROCS.keys()]) killBackground(id)
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
