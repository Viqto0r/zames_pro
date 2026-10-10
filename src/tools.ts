import fs from 'fs/promises'
import path from 'path'
import {
  assertCommandInsideRoot,
  runFile,
  runShell,
  startBackground,
  pollBackground,
  killBackground,
} from './shell.js'
import { isImageName, guessMime, formatSize } from './attachments.js'
import { safePath } from './sandbox.js'
import { createGitTools } from './gitTools.js'
import { createWebTools } from './web.js'
import { createExtraTools, type TodoStore } from './extraTools.js'
import type { ToolArgs, ToolDef, ToolContext } from './types.js'
import type { UndoStore } from './undo.js'

// NOTE: tool descriptions and tool-result strings are AGENT-FACING, not
// user-facing. They must be in ENGLISH (like Claude Code / Codex). Only the
// strings the OPERATOR sees (help, spinner, service messages) are localized —
// those live in src/i18n.ts (CATALOG) and are picked by the locale setting.

export function createTools(
  workdir: string,
  {
    undo,
    todos,
    readOnly = false,
    subagents = false,
  }: {
    undo?: UndoStore | null
    todos?: TodoStore
    readOnly?: boolean
    subagents?: boolean
  } = {},
): ToolDef[] {
  const root = path.resolve(workdir)
  const safe = (p: string): string => safePath(root, p)

  // Extracts text from content/content_base64. base64 is needed because the
  // channel that delivers the model's answer may corrupt characters ($,
  // backslashes, newlines). base64 consists only of [A-Za-z0-9+/=] and is not
  // subject to corruption.
  const decodeContent = (content: unknown, contentBase64: unknown): string => {
    if (typeof contentBase64 === 'string' && contentBase64.length) {
      return Buffer.from(contentBase64, 'base64').toString('utf-8')
    }
    return String(content ?? '')
  }

  // Guard against missing/placeholder required args. Without this, a tool call
  // that omits `path` (or sends it as null) becomes String(undefined) ===
  // "undefined" and the tool silently creates a file literally named
  // "undefined" in the working directory. `req()` rejects that up front.
  // A NUL byte is the classic binary signal (text files essentially never
  // contain one). We only scan the head: a huge archive must not be walked
  // byte-by-byte just to decide it is not text.
  const isBinaryBuffer = (buf: Buffer): boolean => {
    const n = Math.min(buf.length, 8000)
    for (let i = 0; i < n; i++) {
      if (buf[i] === 0) return true
    }
    return false
  }

  const req = (v: unknown, name: string): string => {
    if (v === undefined || v === null) {
      throw new Error(`Missing required argument: ${name}`)
    }
    const s = String(v)
    if (s === '' || s === 'undefined' || s === 'null') {
      throw new Error(`Invalid required argument ${name}: ${JSON.stringify(v)}`)
    }
    return s
  }

  const baseTools: ToolDef[] = [
    {
      name: 'Read',
      description:
        'Read a file. Optional: offset and limit (lines). ' +
        'numbered=true adds cat -n style line numbers (1-based) for reference ' +
        'only — do NOT copy the numbers into Edit old_string. ' +
        'Lines longer than 2000 chars are truncated. ' +
        'Binary files (images, archives) are not decoded: an image returns its ' +
        'path/size as a marker (the operator can paste it to attach it), and ' +
        'other binaries return a short hex header instead of mojibake.',
      parameters: {
        path: 'string',
        offset: 'number?',
        limit: 'number?',
        numbered: 'boolean?',
      },
      fn: async ({ path: p, offset, limit, numbered }: ToolArgs) => {
        const file = safe(req(p, 'path'))
        // Binary guard (N35): reading an image/archive as utf-8 produced
        // mojibake the model tried to reason about. Detect a binary buffer
        // BEFORE decoding and answer with useful metadata instead.
        const buf = await fs.readFile(file)
        if (isImageName(file)) {
          return (
            '[image: ' +
            p +
            '] (' +
            guessMime(file) +
            ', ' +
            formatSize(buf.length) +
            ') — this is an image; its pixels cannot be read as text. To have ' +
            'the model SEE it, the operator can paste/drag the file into the ' +
            'chat (it becomes an [image#N] attachment).'
          )
        }
        if (isBinaryBuffer(buf)) {
          const head = buf.subarray(0, 16)
          return (
            '(binary file: ' +
            p +
            ', ' +
            formatSize(buf.length) +
            ', ' +
            guessMime(file) +
            ')\nFirst bytes (hex): ' +
            Buffer.from(head).toString('hex') +
            '\nUse Bash (e.g. `file`, `xxd`, `unzip -l`) to inspect it.'
          )
        }
        const content = buf.toString('utf-8')
        if (content === '') return '(file is empty)'
        const lines = content.split('\n')
        const start = (offset as number | undefined) ?? 0
        const end = limit ? start + (limit as number) : lines.length
        const slice = lines.slice(start, end)
        const clip = (l: string): string =>
          l.length > 2000 ? l.slice(0, 2000) + ' …[line truncated]' : l
        if (!numbered) return slice.map(clip).join('\n')
        const width = String(start + slice.length).length
        return slice
          .map((l, i) => String(start + i + 1).padStart(width) + '\t' + clip(l))
          .join('\n')
      },
    },

    {
      name: 'Write',
      description:
        'Create or overwrite a file. content — text; content_base64 — the same ' +
        'content base64-encoded (use it if the text contains $, backslashes, ' +
        'newlines or other characters that may get corrupted in transit).',
      parameters: {
        path: 'string',
        content: 'string?',
        content_base64: 'string?',
      },
      fn: async ({ path: p, content, content_base64 }: ToolArgs) => {
        const file = safe(req(p, 'path'))
        const text = decodeContent(content, content_base64)
        if (undo) await undo.backup(file)
        await fs.mkdir(path.dirname(file), { recursive: true })
        await fs.writeFile(file, text, 'utf-8')
        return `File written: ${p}`
      },
    },

    {
      name: 'Edit',
      description:
        'Replace a string in a file. old_string must occur exactly once. ' +
        'old_base64/new_base64 — the same strings base64-encoded (if the text ' +
        'contains special characters that may get corrupted).',
      parameters: {
        path: 'string',
        old_string: 'string?',
        new_string: 'string?',
        old_base64: 'string?',
        new_base64: 'string?',
      },
      fn: async ({
        path: p,
        old_string,
        new_string,
        old_base64,
        new_base64,
      }: ToolArgs) => {
        const file = safe(req(p, 'path'))
        const oldStr = decodeContent(old_string, old_base64)
        const newStr = decodeContent(new_string, new_base64)
        if (oldStr === '') {
          throw new Error('old_string is empty — nothing to replace.')
        }
        let content = await fs.readFile(file, 'utf-8')
        const occurrences = content.split(oldStr).length - 1
        if (occurrences === 0) {
          throw new Error(
            `String not found in ${p}: "${oldStr.slice(0, 60)}..."`,
          )
        }
        if (occurrences > 1) {
          throw new Error(
            `String occurs ${occurrences} times in ${p}. Make old_string more specific.`,
          )
        }
        if (undo) await undo.backup(file)
        // Functional replacement: a string replacer interprets $-patterns
        // ($&, $$, $1) inside newStr and silently corrupts the written text.
        content = content.replace(oldStr, () => newStr)
        await fs.writeFile(file, content, 'utf-8')
        return `Edited: ${p}`
      },
    },

    {
      name: 'Bash',
      description:
        'Run a shell command in the working directory (cmd.exe on Windows, sh on Linux/macOS). ' +
        'Do not use for commands that require interactive input. ' +
        'For a long-running process (dev server, watch, long build) set ' +
        'run_in_background=true: it starts the command and returns an id ' +
        'immediately; poll its output with BashOutput and stop it with BashOutput kill. ' +
        'For git use the Git* tools. For the web use WebFetch / WebSearch.',
      parameters: {
        command: 'string',
        timeout: 'number?',
        run_in_background: 'boolean?',
      },
      fn: async (
        { command, timeout, run_in_background }: ToolArgs,
        ctx?: ToolContext,
      ) => {
        const cmd = req(command, 'command')
        assertCommandInsideRoot(root, cmd)
        if (run_in_background) {
          const id = startBackground(workdir, cmd)
          return (
            'Started in background with id ' +
            id +
            '. Poll it with BashOutput (id="' +
            id +
            '") and stop it with BashOutput (id="' +
            id +
            '", kill=true).'
          )
        }
        return runShell(
          workdir,
          cmd,
          timeout as number | undefined,
          ctx?.signal,
        )
      },
    },

    {
      name: 'BashOutput',
      description:
        'Read the accumulated stdout+stderr of a process started with Bash ' +
        'run_in_background=true, and optionally kill it. id — the id returned ' +
        'by Bash. kill=true terminates the process (and its children).',
      parameters: { id: 'string', kill: 'boolean?' },
      fn: async ({ id, kill }: ToolArgs) => {
        const pid = req(id, 'id')
        if (kill) return killBackground(pid)
        return pollBackground(pid)
      },
    },

    {
      name: 'Glob',
      description:
        'Find files by glob pattern (e.g. "**/*.js"). ' +
        'path (optional) — search directory inside the project.',
      parameters: { pattern: 'string', path: 'string?' },
      fn: async ({ pattern, path: searchPath }: ToolArgs) => {
        const { glob } = await import('fs/promises')
        const cwd = searchPath ? safe(String(searchPath)) : workdir
        const results: string[] = []
        for await (const f of glob(req(pattern, 'pattern'), { cwd })) {
          // Sandbox: ignore anything that goes outside root.
          const abs = path.resolve(cwd, f)
          const rel = path.relative(root, abs)
          if (rel.startsWith('..') || path.isAbsolute(rel)) continue
          results.push(f)
        }
        return results.length ? results.join('\n') : 'No matches found.'
      },
    },

    {
      name: 'Grep',
      description:
        'Search file contents (regular expression). include — file name ' +
        'filter, a single glob or a comma-separated list (e.g. "*.ts" or ' +
        '"*.ts,*.tsx"). output: content (default, matching lines with ' +
        'numbers), files_only (paths only), count (match count per file).',
      parameters: {
        pattern: 'string',
        path: 'string?',
        include: 'string?',
        output: 'string?',
      },
      fn: async ({ pattern, path: searchPath, include, output }: ToolArgs) => {
        const pat = req(pattern, 'pattern')
        const target = searchPath ? safe(String(searchPath)) : workdir
        // include may be a single glob or a comma-separated list.
        const incs = (include ? String(include) : '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const mode = String(output || 'content').toLowerCase()
        // The pattern and the target come from the model, so they are passed
        // as an execFile ARGUMENT ARRAY: the shell never parses them and a
        // pattern carrying $(...)/backticks cannot run as a command (this
        // used to be a sandbox escape). Exit code 1 = no matches, not an error.
        if (process.platform === 'win32') {
          const args = ['/s', '/n', '/r', '/c:' + pat]
          args.push(searchPath ? target + '\\*' : '*')
          return runFile(workdir, 'findstr', args, 30_000, undefined, [1])
        }
        const flags =
          mode === 'files_only' ? '-rlE' : mode === 'count' ? '-rcE' : '-rnE'
        const args = [flags, ...incs.map((g) => '--include=' + g), pat, target]
        return runFile(workdir, 'grep', args, 30_000, undefined, [1])
      },
    },
  ]

  const gitTools = createGitTools(workdir)
  const webTools = createWebTools()
  const extraTools = createExtraTools(workdir, { undo, todos })

  const respondTool: ToolDef = {
    name: 'respond',
    description: 'Give the final answer to the user and finish the task.',
    parameters: { message: 'string' },
    fn: async ({ message }: ToolArgs) => message,
  }

  // `Task` is a SEAM handled by the agent loop (onSubagent), not an ordinary
  // fn. Its body here is only a fallback for a direct unit-test call; the live
  // path never reaches it because agent-loop intercepts the name first.
  const taskTool: ToolDef = {
    name: 'Task',
    description:
      'Delegate a self-contained sub-task to a SUBAGENT that works in its own ' +
      'separate chat with an isolated context, then returns ONLY a final ' +
      'report. Use it to keep heavy research out of the main context — it ' +
      'does NOT run in parallel (one browser, one send slot), so it saves ' +
      'context, not time. subagent_type: "explore" (read-only: search/read, ' +
      'cannot modify) or "general" (full tools). Each call opens a FRESH ' +
      'subagent chat; nothing is reused between calls. The subagent does NOT ' +
      'see this conversation, so `prompt` must be fully self-contained: state ' +
      'the goal, the exact questions, and any file paths/context it needs. ' +
      'Returns the subagent report as text.',
    parameters: {
      description: 'string',
      prompt: 'string',
      subagent_type: 'string?',
    },
    fn: async () =>
      'Subagents are not available in this run. Do the work yourself.',
  }

  // In plan (read-only) mode `Task` is dropped too: a `general` subagent could
  // otherwise write through it and defeat the read-only promise.
  const all = [
    ...baseTools,
    ...extraTools,
    ...gitTools,
    ...webTools,
    ...(subagents && !readOnly ? [taskTool] : []),
    respondTool,
  ]
  return readOnly ? filterToolsForReadOnly(all) : all
}

// Tools that mutate the working tree or run arbitrary commands. In "plan"
// (read-only) mode they are REMOVED from the tool set entirely, so the model
// cannot write by accident while it is still investigating. Removing (rather
// than rejecting at call time) is the honest signal: the agent never sees a
// tool it is not allowed to use, so it does not waste a turn trying.
export const MUTATING_TOOLS = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'ApplyPatch',
  'Bash',
  'BashOutput',
  'GitAdd',
  'GitCommit',
  'GitPush',
])

/** Drop mutating tools for read-only / plan mode. Pure; unit-tested. */
export function filterToolsForReadOnly(tools: ToolDef[]): ToolDef[] {
  return tools.filter((t) => !MUTATING_TOOLS.has(t.name))
}

// MCP tool names are opaque (server + '__' + tool), so the exact-name
// MUTATING_TOOLS set cannot classify them. Instead we match the common
// mutating VERBS in the tool name. It is a heuristic deny-list, not a proof:
// an exotic server could name a mutating tool innocuously. The honest default
// in read-only mode is therefore to drop everything that looks like a writer.
const MCP_MUTATING_RE =
  /(^|_)(click|type|navigate|press|upload|select|drag|fill|hover|evaluate|run_code|run_|handle_dialog|key|screenshot|write|create|delete|update|set|put|post|patch|execute|exec|insert|remove|drop|restart|stop|start|install|kill|move|rename|copy|mkdir|rmdir|touch|chmod|chown)(_|$)/

export function isMutatingMcpTool(name: string): boolean {
  // Strip the server prefix and normalize separators to underscores so the
  // verb matcher sees "browser_click" -> "click".
  const tail = String(name).split('__').pop() || String(name)
  const norm = tail.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  return MCP_MUTATING_RE.test('_' + norm + '_')
}

// Merge MCP tools into the base set. In read-only (plan) mode the MCP tools
// must be filtered too: an MCP server (e.g. @playwright/mcp) exposes mutating
// tools (click/type/navigate) that would otherwise defeat the read-only
// promise. This is a SEPARATE helper (not ad-hoc push sites) so the filtering
// cannot be forgotten at one of the four call sites. Pure; unit-tested.
export function mergeTools(
  base: ToolDef[],
  mcp: ToolDef[] | null | undefined,
  readOnly = false,
): ToolDef[] {
  const all = mcp || []
  const extra = readOnly
    ? all.filter(
        (t) => !MUTATING_TOOLS.has(t.name) && !isMutatingMcpTool(t.name),
      )
    : all
  return [...base, ...extra]
}
