import { spawnSync } from 'node:child_process'
import type { DiagnosticsConfig } from './types.js'

// Post-edit diagnostics (BACKLOG N38). Claude Code feeds diagnostics back to
// the model right after an edit, so it learns about a type error WITHOUT
// spending a whole round-trip asking for `npm run typecheck`. zames has no
// language server, so the closest equivalent is running the project's own
// check command after a file-mutating tool and appending its output to the
// tool result.
//
// This is OPT-IN (diagnostics.enabled = false by default): a full `tsc
// --noEmit` costs several seconds, and on a large project that would slow every
// edit. When enabled, the command runs ONCE per edit and its output is capped
// so a wall of errors cannot flood the context.

export type { DiagnosticsConfig }

export const DEFAULT_DIAGNOSTICS: DiagnosticsConfig = {
  enabled: false,
  command: 'npx tsc --noEmit',
  timeoutMs: 60_000,
  tools: ['Edit', 'Write', 'MultiEdit', 'ApplyPatch'],
  maxChars: 4000,
}

/** True when the tool mutates files and so should trigger a check. */
export function shouldRunDiagnostics(
  cfg: DiagnosticsConfig | null | undefined,
  tool: string,
): boolean {
  if (!cfg || !cfg.enabled) return false
  if (!cfg.command || !cfg.command.trim()) return false
  return (cfg.tools || DEFAULT_DIAGNOSTICS.tools).includes(tool)
}

/**
 * Collapse a check's output to the lines a model actually needs. A clean run
 * (empty output, or tsc's "no errors") returns null: there is nothing to say,
 * and a noise line on every edit would train the model to ignore it.
 */
export function summarizeDiagnostics(
  raw: string,
  maxChars: number,
): string | null {
  const text = String(raw || '').trim()
  if (!text) return null
  // tsc prints nothing on success; eslint prints nothing too. Guard against a
  // benign banner that some tools emit.
  if (/^(no errors?\.?|0 problems?.*)$/im.test(text) && text.length < 40) {
    return null
  }
  // Keep only error-looking lines when we can recognise them, so a long build
  // log collapses to the actual problems. Fall back to the whole output.
  const lines = text.split(/\r?\n/)
  const errLines = lines.filter((l) =>
    /error|warning|✖|✗|TS\d{4}|\bnot assignable\b|\bcannot find\b/i.test(l),
  )
  const chosen = errLines.length ? errLines : lines
  let out = chosen.join('\n')
  if (out.length > maxChars) {
    out = out.slice(0, maxChars) + '\n… [diagnostics truncated]'
  }
  return out
}

/**
 * Run the diagnostics command and return a human-readable summary, or null
 * when it is disabled / clean. Never throws: a failed spawn is treated as
 * "no diagnostics" so an edit is never blocked by the checker.
 */
export function runDiagnostics(
  workdir: string,
  cfg: DiagnosticsConfig | null | undefined,
): string | null {
  if (!cfg || !cfg.enabled || !cfg.command || !cfg.command.trim()) return null
  const isWin = process.platform === 'win32'
  let res: ReturnType<typeof spawnSync>
  try {
    res = spawnSync(cfg.command, {
      cwd: workdir,
      shell: isWin ? process.env.ComSpec || true : '/bin/sh',
      timeout: cfg.timeoutMs || DEFAULT_DIAGNOSTICS.timeoutMs,
      encoding: 'utf-8',
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch {
    return null
  }
  if (res.error) return null
  const out = String(res.stdout || '') + String(res.stderr || '')
  const summary = summarizeDiagnostics(
    out,
    cfg.maxChars || DEFAULT_DIAGNOSTICS.maxChars,
  )
  // Exit 0 with a summary means warnings only; still surface them.
  return summary
}
