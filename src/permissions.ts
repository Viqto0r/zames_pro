import fs from 'fs'
import path from 'path'
import type { ToolArgs } from './types.js'

// Approval policy (BACKLOG C1). Unlike the deleted ConfirmManager,
// this is actually wired into the loop: before every tool call the policy
// is evaluated and a `deny` blocks the call, an `ask` prompts the
// operator. The rules live in `.zames/permissions.json`:

//   {
//     "default": "allow",
//     "rules": [
//       { "tool": "^Bash$", "command": "rm -rf", "action": "deny" },
//       { "tool": "^Write$|^Edit$", "path": "^\\/etc\\/", "action": "ask" }
//     ]
//   }

// Omitting the file keeps the old behavior: every tool runs, no prompts.
// A malformed file is treated as "no policy" rather than blocking the agent.

export type PermissionAction = 'allow' | 'deny' | 'ask'

export interface PermissionRule {
  /** Regex tested against the tool name. Omitted matches every tool. */
  tool?: string
  /** Regex tested against a Bash command string. */
  command?: string
  /** Regex tested against a file-path argument. */
  path?: string
  action: PermissionAction
}

export interface PermissionPolicy {
  default: PermissionAction
  rules: PermissionRule[]
}

export interface PermissionDecision {
  action: PermissionAction
  /** Human-readable reason (rule or default) for the prompt/log. */
  reason: string
}

export function permissionsPath(workdir: string): string {
  return path.join(workdir, '.zames', 'permissions.json')
}

const ACTIONS: PermissionAction[] = ['allow', 'deny', 'ask']

function normAltion(v: unknown): PermissionAction | null {
  if (typeof v !== 'string') return null
  const s = v.toLowerCase() as PermissionAction
  return ACTIONS.includes(s) ? s : null
}

/** Parse the JSON of a permissions file into a policy, or null when empty/broken. */
export function parsePermissions(raw: unknown): PermissionPolicy | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const defAction = normAltion(obj['default']) ?? 'allow'
  const rules = Array.isArray(obj['rules']) ? obj['rules'] : []
  const out: PermissionRule[] = []
  for (const item of rules) {
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    const action = normAltion(e['action'])
    if (!action) continue
    out.push({
      action,
      tool: typeof e['tool'] === 'string' ? (e['tool'] as string) : undefined,
      command:
        typeof e['command'] === 'string' ? (e['command'] as string) : undefined,
      path: typeof e['path'] === 'string' ? (e['path'] as string) : undefined,
    })
  }
  if (!out.length && defAction === 'allow') return null
  return { default: defAction, rules: out }
}

/** Read `.zames/permissions.json`. Missing/broken => null (no policy). */
export function loadPermissions(workdir: string): PermissionPolicy | null {
  let raw: string
  try {
    raw = fs.readFileSync(permissionsPath(workdir), 'utf-8')
  } catch {
    return null
  }
  try {
    return parsePermissions(JSON.parse(raw))
  } catch {
    return null
  }
}

function safeRegex(source: string): RegExp | null {
  try {
    return new RegExp(source)
  } catch {
    return null
  }
}

// A file path may arrive in any of these keys depending on the tool.
// We collect them all and match the path regex against ANY of them.
const PATH_KEYS = ['path', 'file_path', 'notebook_path', 'from', 'to']

export function decidePermission(
  policy: PermissionPolicy | null | undefined,
  tool: string,
  args: ToolArgs | undefined,
): PermissionDecision {
  if (!policy) return { action: 'allow', reason: 'no policy' }
  const a = (args ?? {}) as Record<string, unknown>
  const command =
    typeof a['command'] === 'string' ? (a['command'] as string) : ''
  const paths = PATH_KEYS.map((k) => a[k]).filter(
    (v): v is string => typeof v === 'string',
  )
  for (const r of policy.rules) {
    if (r.tool) {
      const re = safeRegex(r.tool)
      if (!re || !re.test(tool)) continue
    }
    if (r.command) {
      const re = safeRegex(r.command)
      if (!re || !command || !re.test(command)) continue
    }
    if (r.path) {
      const re = safeRegex(r.path)
      if (!re || !paths.some((p) => re.test(p))) continue
    }
    const desc = [
      r.tool ? 'tool=' + r.tool : '',
      r.command ? 'command=' + r.command : '',
      r.path ? 'path=' + r.path : '',
    ]
      .filter(Boolean)
      .join(' ')
    return { action: r.action, reason: 'rule ' + desc }
  }
  return { action: policy.default, reason: 'default' }
}
