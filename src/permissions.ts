import fs from 'fs'
import path from 'path'
import type { ToolArgs } from './types.js'

// Approval policy, wired into the loop: before every tool call the policy is
// evaluated and a `deny` blocks the call while an `ask` prompts the operator.
// The rules live in `.zames/permissions.json`:
//
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
    // A rule whose condition key is not one we understand (`paths`, `tools`,
    // `cmd`) would otherwise lose that condition and match EVERY call of the
    // listed tool — the operator wrote a narrow rule and got a global block.
    // Such a rule is UNUSABLE: dropping it keeps the operator's policy honest
    // (the default still applies) instead of silently widening it.
    const KNOWN = new Set(['action', 'tool', 'command', 'path'])
    const unknown = Object.keys(e).find((k) => !KNOWN.has(k))
    if (unknown !== undefined) continue
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

// The command may be named differently by an MCP tool (its JSON Schema picks
// the field name) or invented by the model. Checking every plausible key keeps
// a `command` rule from being bypassed just because the field is called `cmd`.
const COMMAND_KEYS = ['command', 'cmd', 'shell_command', 'script', 'argv']

// Best-effort check whether a string looks like a filesystem path. Used for
// tools whose arguments are not covered by PATH_KEYS (MCP tools take arbitrary
// arg names from their JSON Schema), so a `path` rule is not silently
// bypassed just because the tool named the field differently.
function looksLikePath(v: string): boolean {
  return /[\\/]/.test(v) || /^\.[.\\/]/.test(v) || /^[A-Za-z]:[\\/]/.test(v)
}

// Collect every path-ish string from a tool call's arguments. ApplyPatch keeps
// the paths INSIDE the patch text (not in a `path` key), and MCP tools use
// arbitrary names; both used to slip past a `{path: ...}` rule.
export function collectPathCandidates(
  tool: string,
  args: ToolArgs | undefined,
): string[] {
  const a = (args ?? {}) as Record<string, unknown>
  const out: string[] = []
  // A path may arrive as a STRING or as an ARRAY of strings (`files: [...]`,
  // `path: [...]`), and MCP tools nest their args (`{file: {path}}`). Accepting
  // only a top-level string let a `path` deny rule be bypassed by wrapping the
  // same path one level deeper or in an array.
  const addValue = (v: unknown): void => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) {
      for (const x of v) if (typeof x === 'string') out.push(x)
    }
  }
  for (const k of PATH_KEYS) {
    if (k in a) addValue(a[k])
  }
  if (tool === 'ApplyPatch') {
    // Parse the patch and pull the file headers out of it.
    const text =
      typeof a['patch'] === 'string'
        ? (a['patch'] as string)
        : typeof a['patch_base64'] === 'string'
          ? Buffer.from(a['patch_base64'] as string, 'base64').toString('utf-8')
          : ''
    const re = /^\*\*\*\s*(?:Add|Update|Delete) File:\s*(.+?)\s*$/gm
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) out.push(m[1])
  }
  // MCP tools (and any unknown tool): scan the values for path-looking
  // entries — through ARRAYS and NESTED objects too, since an MCP schema is
  // free to nest (`{file: {path}}`) or take `argv: ['cat', '/etc/x']`. Only
  // values that clearly look like paths are taken (depth-bounded to avoid a
  // pathological payload).
  //
  // This runs for EVERY tool, not only MCP ones: a model that invents an
  // argument shape (`{file: {path}}`, `{files: [...]}`) on a built-in tool
  // used to slip past a `path` deny rule, silently widening the operator's
  // policy. Path-looking values of a built-in's own arguments are exactly what
  // such a rule is meant to match.
  {
    const walk = (v: unknown, depth: number): void => {
      if (depth > 4 || v === null || v === undefined) return
      if (typeof v === 'string') {
        if (looksLikePath(v)) out.push(v)
        return
      }
      if (Array.isArray(v)) {
        for (const x of v) walk(x, depth + 1)
        return
      }
      if (typeof v === 'object') {
        for (const x of Object.values(v as Record<string, unknown>)) {
          walk(x, depth + 1)
        }
      }
    }
    for (const v of Object.values(a)) walk(v, 0)
  }
  // De-duplicate: a known key (`path`) is now also reached by the generic
  // nested walk, and callers compare the candidate LIST (`deepEqual`).
  return Array.from(new Set(out))
}

export function decidePermission(
  policy: PermissionPolicy | null | undefined,
  tool: string,
  args: ToolArgs | undefined,
): PermissionDecision {
  if (!policy) return { action: 'allow', reason: 'no policy' }
  const a = (args ?? {}) as Record<string, unknown>
  // A command may be a STRING (`command`, `cmd`, ...) or an ARRAY (`argv`,
  // the natural shape for execFile-style MCP tools). Accepting only strings
  // let a `command` deny be bypassed by passing the words as an array.
  const commands: string[] = []
  // Collect a value as a command string: a string is one command, an ARRAY
  // (argv) is joined into one line so a rule can match the words in order.
  const addCommand = (v: unknown): void => {
    if (typeof v === 'string') commands.push(v)
    else if (Array.isArray(v)) {
      const parts = v.filter((x) => typeof x === 'string')
      if (parts.length) commands.push(parts.join(' '))
    }
  }
  for (const k of COMMAND_KEYS) {
    if (k in a) addCommand(a[k])
  }
  // MCP tools (and a model that nests its payload) send the command one or
  // more levels down — `{args: {command}}`, `{input: {params: {cmd}}}`.
  // Checking only the TOP level let a `command` deny rule be bypassed by
  // wrapping the same words in an object, so nested objects and arrays are
  // scanned too (depth-bounded like the path scan).
  const walkCommands = (v: unknown, depth: number): void => {
    if (depth > 4 || v === null || v === undefined) return
    if (Array.isArray(v)) {
      for (const x of v) walkCommands(x, depth + 1)
      return
    }
    if (typeof v !== 'object') return
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      if (COMMAND_KEYS.includes(key)) addCommand(val)
      walkCommands(val, depth + 1)
    }
  }
  walkCommands(a, 0)
  const paths = collectPathCandidates(tool, args)
  for (const r of policy.rules) {
    // An UNPARSABLE regex in any field of the rule makes the rule fail
    // CLOSED: skipping it silently (the old behavior) turned a deny rule with
    // a typo (`^(Bash$`) into "allow everything it was meant to block".
    const bad = [r.tool, r.command, r.path].find(
      (src) => src !== undefined && safeRegex(src) === null,
    )
    if (bad !== undefined) {
      return { action: 'deny', reason: 'rule has an invalid regex: ' + bad }
    }
    if (r.tool) {
      const re = safeRegex(r.tool)
      if (!re || !re.test(tool)) continue
    }
    if (r.command) {
      const re = safeRegex(r.command)
      if (!re || !commands.some((c) => re.test(c))) continue
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
