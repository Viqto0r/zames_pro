import fs from 'fs/promises'
import path from 'path'
import { exec, type ExecOptions } from 'child_process'
import { createGitTools } from './gitTools.js'
import { createWebTools } from './web.js'
import { createExtraTools } from './extraTools.js'
import type { ToolArgs, ToolDef } from './types.js'
import type { UndoStore } from './undo.js'

// NOTE: tool descriptions and tool-result strings are AGENT-FACING, not
// user-facing. They must be in ENGLISH (like Claude Code / Codex). Only the
// strings the OPERATOR sees (help, spinner, service messages) are localized —
// those live in src/i18n.ts (CATALOG) and are picked by the locale setting.

export function createTools(
  workdir: string,
  { undo }: { undo?: UndoStore | null } = {},
): ToolDef[] {
  const root = path.resolve(workdir)
  const safe = (p: string): string => {
    const resolved = path.resolve(root, p)
    // startsWith(root) would let through sibling paths with a common prefix
    // (C:\work\proj vs C:\work\proj-old). We compute via relative().
    const rel = path.relative(root, resolved)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Access outside the working directory is forbidden: ${p}`)
    }
    return resolved
  }

  // Sandbox (option A): don't let the command go above root.
  // This is a protective barrier, not full OS isolation.
  const assertCommandInsideRoot = (command: string): void => {
    const cmd = String(command || '')
    const cdRe = /(?:^|[;&|]|\s)(?:cd|pushd)\s+([^;&|]+)/gi
    let m
    while ((m = cdRe.exec(cmd))) {
      const raw = m[1].trim()
      if (!raw || raw === '-') continue
      const target = path.resolve(root, raw)
      const rel = path.relative(root, target)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('Sandbox: leaving ' + root + ' is forbidden (cd ' + raw + ')')
      }
    }
  }
  const runShell = (command: string, timeout = 30_000): Promise<string> =>
    new Promise((resolve) => {
      const options: ExecOptions = {
        cwd: workdir,
        timeout,
        maxBuffer: 1024 * 1024 * 8,
        windowsHide: true,
        env: { ...process.env },
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
          parts.push(`⏱ Timeout after ${timeout}ms — process killed.`)
        } else if (err.code !== undefined && err.code !== null) {
          parts.push(`Exit code: ${err.code}`)
        } else if (err.signal) {
          parts.push(`Killed by signal: ${err.signal}`)
        } else {
          parts.push(`Error: ${err.message}`)
        }

        if (out.trim()) parts.push(`stdout:\n${out.trim()}`)
        if (errStr.trim()) parts.push(`stderr:\n${errStr.trim()}`)

        resolve(parts.join('\n'))
      })
    })

  // Extracts text from content/content_base64. base64 is needed because the
  // channel that delivers the model's answer may corrupt characters ($,
  // backslashes, newlines). base64 consists only of [A-Za-z0-9+/=] and is not
  // subject to corruption.
  const decodeContent = (
    content: unknown,
    contentBase64: unknown,
  ): string => {
    if (typeof contentBase64 === 'string' && contentBase64.length) {
      return Buffer.from(contentBase64, 'base64').toString('utf-8')
    }
    return String(content ?? '')
  }

  // Guard against missing/placeholder required args. Without this, a tool call
  // that omits `path` (or sends it as null) becomes String(undefined) ===
  // "undefined" and the tool silently creates a file literally named
  // "undefined" in the working directory. `req()` rejects that up front.
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
        'Lines longer than 2000 chars are truncated.',
      parameters: {
        path: 'string',
        offset: 'number?',
        limit: 'number?',
        numbered: 'boolean?',
      },
      fn: async ({ path: p, offset, limit, numbered }: ToolArgs) => {
        const file = safe(req(p, 'path'))
        const content = await fs.readFile(file, 'utf-8')
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
      fn: async ({ path: p, old_string, new_string, old_base64, new_base64 }: ToolArgs) => {
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
        content = content.replace(oldStr, newStr)
        await fs.writeFile(file, content, 'utf-8')
        return `Edited: ${p}`
      },
    },

    {
      name: 'Bash',
      description:
        'Run a shell command in the working directory (cmd.exe on Windows, sh on Linux/macOS). ' +
        'Do not use for long-running processes (servers) — they will hit the timeout. ' +
        'Do not use for commands that require interactive input. ' +
        'For git use the Git* tools. For the web use WebFetch / WebSearch.',
      parameters: { command: 'string', timeout: 'number?' },
      fn: async ({ command, timeout }: ToolArgs) => {
        assertCommandInsideRoot(req(command, 'command'))
        return runShell(req(command, 'command'), timeout as number | undefined)
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
        'filter (e.g. "*.ts"). output: content (default, matching lines with ' +
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
        const inc = include ? String(include).trim() : ''
        const mode = String(output || 'content').toLowerCase()
        if (process.platform === 'win32') {
          const escaped = pat.replace(/"/g, '\\"')
          const scope = searchPath ? '"' + target + '\\*' : '*'
          return runShell(`findstr /s /n /r /c:"${escaped}" ` + scope)
        }
        const flags =
          mode === 'files_only'
            ? '-rlE'
            : mode === 'count'
              ? '-rcE'
              : '-rnE'
        const includeArg = inc ? ' --include=' + JSON.stringify(inc) : ''
        return runShell(
          `grep ${flags}${includeArg} ${JSON.stringify(pat)} ` +
            `${JSON.stringify(target)} || true`,
        )
      },
    },
  ]

  const gitTools = createGitTools(workdir)
  const webTools = createWebTools()
  const extraTools = createExtraTools(workdir, { undo })

  const respondTool: ToolDef = {
    name: 'respond',
    description: 'Give the final answer to the user and finish the task.',
    parameters: { message: 'string' },
    fn: async ({ message }: ToolArgs) => message,
  }

  return [...baseTools, ...extraTools, ...gitTools, ...webTools, respondTool]
}
