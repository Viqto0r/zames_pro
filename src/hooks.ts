import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import type { ToolArgs } from './types.js'

// PreToolUse / PostToolUse hooks — an extension point that lets the operator
// (or the agent itself) attach an external script to every tool call without
// patching the core: auto-`prettier` after an Edit, a guard that blocks a
// `Bash` command matching `rm -rf`, a log line after a Write, etc.
//
// Config lives in `.zames/hooks.json` in the working directory:
//
//   {
//     "PreToolUse":  [{ "matcher": "^Bash$", "command": "node guard.mjs" }],
//     "PostToolUse": [{ "matcher": "^Edit$", "command": "npx prettier -w ." }]
//   }
//
// `matcher` is a regex tested against the tool name; omitted/empty matches
// every tool. The hook command receives the call as JSON on stdin and in the
// ZAMES_* env vars, and runs with the working directory as cwd.
//
// Hooks are BEST-EFFORT: a hook that cannot be spawned, times out or crashes
// must never take down the agent loop. Only a deliberate non-zero exit of a
// PreToolUse hook has an effect — it blocks the tool call.

export interface HookEntry {
  /** Regex matched against the tool name. Omitted/empty matches every tool. */
  matcher?: string
  /** Shell command to run. */
  command: string
}

export interface HooksConfig {
  PreToolUse?: HookEntry[]
  PostToolUse?: HookEntry[]
  // Lifecycle events (N32), mirroring Claude Code: run at the boundaries of a
  // task rather than around a single tool call.
  SessionStart?: HookEntry[]
  UserPromptSubmit?: HookEntry[]
  PreCompact?: HookEntry[]
  Stop?: HookEntry[]
  SubagentStop?: HookEntry[]
}

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreCompact'
  | 'Stop'
  | 'SubagentStop'

const LIFECYCLE_EVENTS: HookEvent[] = [
  'SessionStart',
  'UserPromptSubmit',
  'PreCompact',
  'Stop',
  'SubagentStop',
]

// A hook is a helper, not a task: if it has not finished in ten seconds the
// tool call must not be held hostage by it.
const HOOK_TIMEOUT_MS = 10_000
const HOOK_MAX_BUFFER = 1024 * 1024

export function hooksConfigPath(workdir: string): string {
  return path.join(workdir, '.zames', 'hooks.json')
}

/**
 * Reads `.zames/hooks.json`. A missing, unreadable or malformed file yields an
 * empty config: a broken hooks file must not stop the agent from starting.
 */
export function loadHooks(workdir: string): HooksConfig {
  let raw: string
  try {
    raw = fs.readFileSync(hooksConfigPath(workdir), 'utf-8')
  } catch {
    return {}
  }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!data || typeof data !== 'object') return {}
  const obj = data as Record<string, unknown>
  return {
    PreToolUse: normalizeEntries(obj['PreToolUse']),
    PostToolUse: normalizeEntries(obj['PostToolUse']),
    SessionStart: normalizeEntries(obj['SessionStart']),
    UserPromptSubmit: normalizeEntries(obj['UserPromptSubmit']),
    PreCompact: normalizeEntries(obj['PreCompact']),
    Stop: normalizeEntries(obj['Stop']),
    SubagentStop: normalizeEntries(obj['SubagentStop']),
  }
}

function normalizeEntries(value: unknown): HookEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: HookEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const command = entry['command']
    if (typeof command !== 'string' || command.trim() === '') continue
    const matcher = entry['matcher']
    out.push({
      command,
      matcher: typeof matcher === 'string' ? matcher : undefined,
    })
  }
  return out.length ? out : undefined
}

/** True when the entry applies to the tool. A bad regex matches nothing. */
export function matchesHook(entry: HookEntry, tool: string): boolean {
  if (!entry.matcher) return true
  try {
    return new RegExp(entry.matcher).test(tool)
  } catch {
    return false
  }
}

interface HookRun {
  code: number
  stdout: string
  stderr: string
}

function runHook(
  entry: HookEntry,
  event: HookEvent,
  tool: string,
  args: ToolArgs,
  workdir: string,
  result?: string,
): Promise<HookRun> {
  return new Promise((resolve) => {
    const payload = {
      event,
      tool,
      args: args ?? {},
      ...(result === undefined ? {} : { result }),
    }
    const env = {
      ...process.env,
      ZAMES_HOOK_EVENT: event,
      ZAMES_TOOL_NAME: tool,
      ZAMES_TOOL_ARGS: JSON.stringify(args ?? {}),
      ...(result === undefined ? {} : { ZAMES_TOOL_RESULT: result }),
    }
    let child
    try {
      child = exec(
        entry.command,
        {
          cwd: workdir,
          timeout: HOOK_TIMEOUT_MS,
          maxBuffer: HOOK_MAX_BUFFER,
          windowsHide: true,
          env,
          shell:
            process.platform === 'win32'
              ? process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
              : '/bin/sh',
        },
        (err, stdout, stderr) => {
          let code = 0
          if (err) {
            const c = (err as { code?: unknown }).code
            code = typeof c === 'number' ? c : 1
          }
          resolve({
            code,
            stdout: (stdout || '').toString(),
            stderr: (stderr || '').toString(),
          })
        },
      )
    } catch {
      // Spawning the shell itself failed — treat it as a hook error, not a
      // loop error.
      resolve({ code: 1, stdout: '', stderr: 'hook could not be started' })
      return
    }
    // The call is also fed on stdin so a hook can parse the full JSON without
    // depending on env size limits. A hook that ignores stdin is fine.
    if (child.stdin) {
      child.stdin.on('error', () => {})
      child.stdin.end(JSON.stringify(payload) + String.fromCharCode(10))
    }
  })
}

/**
 * Runs every matching PreToolUse hook in order. Returns a denial reason when a
 * hook exits non-zero (its stderr/stdout becomes the tool result and the tool
 * itself does NOT run), or null to allow the call.
 */
export async function runPreToolUse(
  hooks: HooksConfig | null | undefined,
  tool: string,
  args: ToolArgs,
  workdir: string,
): Promise<string | null> {
  for (const entry of hooks?.PreToolUse ?? []) {
    if (!matchesHook(entry, tool)) continue
    const r = await runHook(entry, 'PreToolUse', tool, args, workdir)
    if (r.code !== 0) {
      const reason = (r.stderr || r.stdout).trim()
      return reason || `hook exited with code ${r.code}`
    }
  }
  return null
}

/**
 * Runs every matching PostToolUse hook and returns their stdout, ready to be
 * appended to the tool result. Errors are ignored: the tool already ran, and
 * its result must be reported.
 */
export async function runPostToolUse(
  hooks: HooksConfig | null | undefined,
  tool: string,
  args: ToolArgs,
  result: string,
  workdir: string,
): Promise<string> {
  return runEventHooks(hooks, 'PostToolUse', workdir, tool, args, result)
}

/**
 * Run every hook registered for a LIFECYCLE event (SessionStart, Stop, …).
 * Best-effort like the tool hooks: the combined stdout is returned to the
 * caller for a notice, and errors never break the task. `tool`/`args` are
 * informational for these events (there is no tool call), so they default to
 * the event name and an empty object.
 */
export async function runLifecycleHooks(
  hooks: HooksConfig | null | undefined,
  event: HookEvent,
  workdir: string,
  extra: ToolArgs = {},
): Promise<string> {
  if (!LIFECYCLE_EVENTS.includes(event)) return ''
  return runEventHooks(hooks, event, workdir, event, extra)
}

async function runEventHooks(
  hooks: HooksConfig | null | undefined,
  event: HookEvent,
  workdir: string,
  tool: string,
  args: ToolArgs,
  result?: string,
): Promise<string> {
  const list = hooks?.[event as keyof HooksConfig] as HookEntry[] | undefined
  const parts: string[] = []
  for (const entry of list ?? []) {
    if (!matchesHook(entry, tool)) continue
    const r = await runHook(entry, event, tool, args, workdir, result)
    const out = r.stdout.trim()
    if (out) parts.push(out)
  }
  return parts.join(String.fromCharCode(10))
}
