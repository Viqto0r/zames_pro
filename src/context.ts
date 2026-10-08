import fs from 'fs/promises'
import { statSync } from 'fs'
import path from 'path'
import os from 'os'

// ---------- Project context: AGENTS.md / MEMORY / skills ----------
//
// Codex loads AGENTS.md from the repo root and merges it into the system
// prompt. Claude Code uses CLAUDE.md with the same role, plus ~/.claude for
// global instructions and skills in ~/.claude/skills/**/SKILL.md.
//
// Here we implement the same idea for zames:
//   * AGENTS.md           - project instructions (working dir + chain up);
//   * MEMORY.md           - notes accumulated between sessions;
//   * ~/.zames/AGENTS.md  - global instructions;
//   * skills              - SKILL.md files, progressive disclosure;
//   * custom commands     - .md files under .zames/commands/.
//
// All reads are best-effort: a missing or broken file must not break the
// agent loop.

export interface ContextFile {
  path: string
  content: string
}

export interface SkillInfo {
  name: string
  description: string
  path: string
  dir: string
  allowedTools?: string[]
  source: 'project' | 'global'
  userInvokable: boolean
  // Body of a BUILT-IN skill (not read from disk). Present only for built-ins
  // that no project/global SKILL.md overrode; expandSlashTarget reads it
  // directly instead of the file at `path`.
  builtinBody?: string
}

// Built-in skills, always available unless a project/global skill with the
// same name overrides them (real files win). They give the agent proven,
// reusable workflows in the spirit of Claude Code / Codex. English only (the
// body goes into the agent-facing task text).
const BUILTIN_SKILLS: Array<{
  name: string
  description: string
  body: string
}> = [
  {
    name: 'commit',
    description:
      'Prepare a clean git commit from the current changes (stage, message).',
    body:
      'Prepare a commit from the current working-tree changes. Steps:\n' +
      '1. Run `git status` and `git diff` (and `git diff --staged`) to see exactly what changed.\n' +
      '2. Stage ONLY the files that belong to the intended change — never `git add -A` blindly.\n' +
      '3. Write a short imperative subject line (<=72 chars) and an optional body explaining WHY.\n' +
      '4. Commit with `git commit`. Do NOT push.\n' +
      'If the changes are unrelated or include junk, report that and ask before committing.',
  },
  {
    name: 'review',
    description:
      'Review the current diff for bugs, risks and style issues (no code changes).',
    body:
      'Review the current uncommitted diff. Do NOT change any code — only report.\n' +
      '1. Get the diff with `git diff` (and `git diff --staged`).\n' +
      '2. Look for real problems: correctness bugs, unhandled edge cases, races, ' +
      'silent failures, security issues, broken error handling.\n' +
      '3. For each finding give file:line, what is wrong and WHY it matters.\n' +
      '4. End with a short verdict: safe to commit / needs fixes, and list the must-fix items first.',
  },
  {
    name: 'test',
    description: 'Run the project tests and fix failures until green.',
    body:
      'Run the project test suite and make it green. Steps:\n' +
      '1. Find the test command (package.json scripts, Makefile, README).\n' +
      '2. Run it. If it passes, report the result and stop.\n' +
      '3. On failure, read the failing test and the code it exercises. Fix the ROOT cause ' +
      '(do not weaken or delete the test to make it pass, unless the test itself is wrong).\n' +
      '4. Re-run until it passes. Report what changed and the final result.',
  },
  {
    name: 'debug',
    description: 'Systematically diagnose and fix a bug.',
    body:
      'Diagnose a bug systematically. Steps:\n' +
      '1. Reproduce it: find the smallest command/steps that show the failure.\n' +
      '2. Form a hypothesis about the cause and find evidence in the code (read the actual code path).\n' +
      '3. Narrow it down (logs, a focused test, a minimal repro) BEFORE editing.\n' +
      '4. Fix the ROOT cause, not the symptom. Add a regression test that fails before and passes after.\n' +
      '5. Verify the fix and report the cause, the change and the test.',
  },
  {
    name: 'explain',
    description: 'Explain how a file/module/feature works.',
    body:
      'Explain how the requested code works, for a developer new to it.\n' +
      '1. Read the relevant files (start from the entry point and follow the calls).\n' +
      '2. Give a concise overview: what it does, its inputs/outputs, the main flow.\n' +
      '3. Call out non-obvious details: side effects, ordering, error handling, ' +
      'couplings, and any WHY-comments that matter.\n' +
      '4. Do NOT change code. Answer in the operator language.',
  },
]

export interface CustomCommand {
  name: string
  description: string
  path: string
  body: string
  /** Shown in the «/» suggest list, e.g. "<file> [focus]". */
  argumentHint?: string
  /** Named positional arguments (from frontmatter `arguments:`), in order. */
  arguments?: string[]
}

export interface LoadedContext {
  agents: ContextFile[]
  /** Nested AGENTS.md found in the subdirectories the current task touches
   *  (B6). Rendered in their own section so it is clear they apply only to
   *  part of the tree, not to the whole project. Optional: absent means none. */
  scopedAgents?: ContextFile[]
  memory: ContextFile[]
  skills: SkillInfo[]
  commands: CustomCommand[]
}

const MAX_FILE_BASE = 60000
const MAX_TOTAL = 240000

const CRLF_RE = /\r\n/g
const NL = String.fromCharCode(10)

function clipIf(name: string, content: string, budget: number): string {
  const cleaned = content.replace(CRLF_RE, NL).trim()
  if (cleaned.length <= budget) return cleaned
  const keep = Math.max(0, budget - 120)
  return (
    cleaned.slice(0, keep) +
    NL +
    NL +
    '[... ' +
    name +
    ' truncated (' +
    (cleaned.length - keep) +
    ' chars omitted) ...]'
  )
}

async function readIfFile(
  p: string,
  budget: number,
): Promise<ContextFile | null> {
  try {
    const st = await fs.stat(p)
    if (!st.isFile()) return null
    const raw = await fs.readFile(p, 'utf-8')
    // An EXISTING but empty file is still present: keep it so the prompt
    // shows an (empty) AGENTS.md/MEMORY.md section instead of silently
    // dropping the file. Only a read failure returns null.
    const content = clipIf(path.basename(p), raw, budget)
    return { path: p, content }
  } catch {
    return null
  }
}

const AGENT_NAMES = ['AGENTS.md', 'agents.md', 'Agents.md']
const MEMORY_NAMES = ['MEMORY.md', 'memory.md', 'Memory.md']

async function findNamedFile(
  dir: string,
  names: string[],
): Promise<string | null> {
  for (const n of names) {
    const p = path.join(dir, n)
    const st = await fs.stat(p).catch(() => null)
    if (st && st.isFile()) return p
  }
  return null
}

function dirChainFromRoot(from: string): string[] {
  const out = []
  let cur = path.resolve(from)
  const root = path.parse(cur).root
  while (true) {
    out.unshift(cur)
    if (cur === root) break
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return out
}

interface FrontMatter {
  name?: string
  description?: string
  allowedTools?: string[]
  userInvokable?: boolean
  argumentHint?: string
  arguments?: string[]
}

const PROJECT_SKILL_DIRS = [
  '.zames/skills',
  '.claude/skills',
  '.agents/skills',
  'skills',
]

function parseFrontmatter(raw: string): FrontMatter {
  const norm = raw.replace(CRLF_RE, NL)
  if (!norm.startsWith('---')) return {}
  const end = norm.indexOf(NL + '---', 3)
  if (end === -1) return {}
  const block = norm.slice(3, end)
  const out: Record<string, string> = {}
  let lastKey: string | null = null
  for (const rawLine of block.split(NL)) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line || /^\s*#/.test(line)) continue
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (m && !/^\s/.test(line)) {
      const key: string = m[1]
      let val = (m[2] || '').trim()
      if (val === '|' || val === '>') {
        out[key] = ''
        lastKey = key
        continue
      }
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      out[key] = val
      lastKey = key
    } else if (lastKey && /^\s+/.test(line)) {
      out[lastKey] = ((out[lastKey] || '') + ' ' + line.trim()).trim()
    }
  }
  const allowedTools =
    typeof out['allowed-tools'] === 'string'
      ? out['allowed-tools']
          .split(/,/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined
  const userInvokable =
    typeof out['user-invokable'] === 'string'
      ? out['user-invokable'].toLowerCase() !== 'false'
      : undefined
  const argumentsList =
    typeof out['arguments'] === 'string'
      ? out['arguments']
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined
  return {
    name: out.name,
    description: out.description,
    allowedTools,
    userInvokable,
    argumentHint:
      typeof out['argument-hint'] === 'string'
        ? out['argument-hint']
        : undefined,
    arguments: argumentsList,
  }
}

export function skillBody(raw: string): string {
  const norm = raw.replace(CRLF_RE, NL)
  if (!norm.startsWith('---')) return norm.trim()
  const end = norm.indexOf(NL + '---', 3)
  if (end === -1) return norm.trim()
  return norm.slice(norm.indexOf(NL, end + 1) + 1).trim()
}

async function findSkillFiles(root: string, depth = 3): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string, level: number): Promise<void> => {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isFile() && e.name === 'SKILL.md') out.push(full)
      else if (e.isDirectory() && level < depth) await walk(full, level + 1)
    }
  }
  await walk(root, 1)
  return out
}

export async function loadSkills(workdir: string): Promise<SkillInfo[]> {
  const found: SkillInfo[] = []
  const seen = new Set<string>()
  const roots: Array<{ dir: string; source: 'project' | 'global' }> = []
  for (const rel of PROJECT_SKILL_DIRS) {
    roots.push({ dir: path.join(workdir, rel), source: 'project' })
  }
  roots.push({
    dir: path.join(os.homedir(), '.zames', 'skills'),
    source: 'global',
  })
  roots.push({
    dir: path.join(os.homedir(), '.claude', 'skills'),
    source: 'global',
  })
  for (const root of roots) {
    const files = await findSkillFiles(root.dir)
    for (const f of files) {
      const raw = await fs.readFile(f, 'utf-8').catch(() => null)
      if (raw === null) continue
      const fm = parseFrontmatter(raw)
      const dir = path.dirname(f)
      const name = (fm.name || path.basename(dir)).trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const description = (fm.description || '').replace(/\s+/g, ' ').trim()
      found.push({
        name,
        description,
        path: f,
        dir,
        allowedTools: fm.allowedTools,
        source: root.source,
        userInvokable: fm.userInvokable !== false,
      })
    }
  }
  found.sort((a, b) => a.name.localeCompare(b.name))
  // Built-in skills come LAST (lowest priority): any project/global skill
  // with the same name already claimed `seen` and wins. Only the not-overridden
  // built-ins are appended, with an empty path and the body inline.
  for (const b of BUILTIN_SKILLS) {
    const key = b.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    found.push({
      name: b.name,
      description: b.description,
      path: '',
      dir: '',
      source: 'global',
      userInvokable: true,
      builtinBody: b.body,
    })
  }
  return found
}

const PROJECT_COMMAND_DIRS = [
  '.zames/commands',
  '.claude/commands',
  '.agents/commands',
]

async function loadCommandsFromDir(dir: string): Promise<CustomCommand[]> {
  const out: CustomCommand[] = []
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    if (!/\.md$/i.test(e)) continue
    const full = path.join(dir, e)
    const st = await fs.stat(full).catch(() => null)
    if (!st || !st.isFile()) continue
    const raw = await fs.readFile(full, 'utf-8').catch(() => null)
    if (raw === null) continue
    const fm = parseFrontmatter(raw)
    const name = path.basename(e, '.md').trim()
    if (!name) continue
    out.push({
      name,
      description: (fm.description || '').replace(/\s+/g, ' ').trim(),
      path: full,
      body: skillBody(raw),
      argumentHint: fm.argumentHint,
      arguments: fm.arguments,
    })
  }
  return out
}

export async function loadCommands(workdir: string): Promise<CustomCommand[]> {
  const out: CustomCommand[] = []
  const seen = new Set<string>()
  const dirs = PROJECT_COMMAND_DIRS.map((d) => path.join(workdir, d))
  dirs.push(path.join(os.homedir(), '.zames', 'commands'))
  dirs.push(path.join(os.homedir(), '.claude', 'commands'))
  for (const dir of dirs) {
    for (const c of await loadCommandsFromDir(dir)) {
      const key = c.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(c)
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

async function loadAgentsChain(workdir: string): Promise<ContextFile[]> {
  const out: ContextFile[] = []
  const seen = new Set<string>()
  for (const p of [
    path.join(os.homedir(), '.zames', 'AGENTS.md'),
    path.join(os.homedir(), '.claude', 'CLAUDE.md'),
  ]) {
    const f = await readIfFile(p, MAX_FILE_BASE)
    if (f && !seen.has(f.path)) {
      seen.add(f.path)
      out.push(f)
    }
  }
  const chain = dirChainFromRoot(workdir)
  for (const dir of chain) {
    const p = await findNamedFile(dir, AGENT_NAMES)
    if (!p || seen.has(p)) continue
    const f = await readIfFile(p, MAX_FILE_BASE)
    if (f) {
      seen.add(p)
      out.push(f)
    }
  }
  return out
}

async function loadMemoryChain(workdir: string): Promise<ContextFile[]> {
  const out: ContextFile[] = []
  const seen = new Set<string>()
  for (const p of [
    path.join(os.homedir(), '.zames', 'MEMORY.md'),
    path.join(os.homedir(), '.claude', 'MEMORY.md'),
  ]) {
    const f = await readIfFile(p, MAX_FILE_BASE)
    if (f && !seen.has(f.path)) {
      seen.add(f.path)
      out.push(f)
    }
  }
  const chain = dirChainFromRoot(workdir)
  for (const dir of chain) {
    const p = await findNamedFile(dir, MEMORY_NAMES)
    if (!p || seen.has(p)) continue
    const f = await readIfFile(p, MAX_FILE_BASE)
    if (f) {
      seen.add(p)
      out.push(f)
    }
  }
  return out
}

export async function loadProjectContext(
  workdir: string,
  touchPaths: string[] = [],
): Promise<LoadedContext> {
  const [agents, memory, skills, commands] = await Promise.all([
    loadAgentsChain(workdir).catch(() => []),
    loadMemoryChain(workdir).catch(() => []),
    loadSkills(workdir).catch(() => []),
    loadCommands(workdir).catch(() => []),
  ])
  const scopedAgents = await loadScopedAgents(workdir, touchPaths).catch(
    () => [],
  )
  let used = 0
  const withinBudget = (files: ContextFile[]): ContextFile[] => {
    const kept = []
    for (const f of files) {
      if (used + f.content.length > MAX_TOTAL) break
      used += f.content.length
      kept.push(f)
    }
    return kept
  }
  return {
    agents: withinBudget(agents),
    // Scoped files are dropped silently when the total budget is already spent
    // on the main chain: a nested AGENTS.md is an optimization, not a hard
    // requirement, and must never push out a top-level instruction.
    scopedAgents: withinBudget(scopedAgents),
    memory: withinBudget(memory),
    skills,
    commands,
  }
}

// A directory is "touched" by a task when the task text mentions a path inside
// it (a `@ref`, a quoted path, a bare `src/foo.ts`). We look for the deepest
// existing directories named in the text and collect AGENTS.md/MEMORY.md from
// them and their ancestors below `workdir`. Implemented by scanning word tokens
// rather than a regex over the whole text so a long prompt stays cheap.
function touchedDirs(workdir: string, text: string): string[] {
  const root = path.resolve(workdir)
  const out = new Set<string>()
  const words = String(text || '')
    .split(/\s+/)
    .map((w) => w.replace(/^[\('"\[]+/, '').replace(/[\),.;:'"\]]+$/, ''))
  for (const w of words) {
    if (!w || w.length > 300) continue
    // Only path-looking tokens (contain a separator or a known file extension).
    if (!/[\\/]/.test(w) && !/\.[A-Za-z0-9]{1,8}$/.test(w)) continue
    const abs = path.isAbsolute(w) ? w : path.resolve(root, w)
    if (abs !== root && !abs.startsWith(root + path.sep)) continue
    // Walk from the deepest directory that actually exists up to the root.
    let dir = abs
    let st = statSyncSafe(dir)
    while (!st && dir !== root && dir.startsWith(root + path.sep)) {
      dir = path.dirname(dir)
      st = statSyncSafe(dir)
    }
    if (!st || !st.isDirectory()) continue
    let cur = dir
    while (cur.startsWith(root + path.sep)) {
      out.add(cur)
      cur = path.dirname(cur)
    }
  }
  return [...out]
}

function statSyncSafe(p: string): import('fs').Stats | null {
  try {
    return statSync(p)
  } catch {
    return null
  }
}

async function loadScopedAgents(
  workdir: string,
  touchPaths: string[],
): Promise<ContextFile[]> {
  if (!touchPaths.length) return []
  const root = path.resolve(workdir)
  // Collect every directory named by the task, deepest first, so the most
  // specific instructions come first and win the budget.
  const dirs = touchedDirs(root, touchPaths.join(' '))
  dirs.sort((a, b) => b.length - a.length)
  const out: ContextFile[] = []
  const seen = new Set<string>()
  for (const dir of dirs) {
    for (const names of [AGENT_NAMES, MEMORY_NAMES]) {
      const p = await findNamedFile(dir, names)
      if (!p || seen.has(p)) continue
      const f = await readIfFile(p, MAX_FILE_BASE)
      if (!f) continue
      seen.add(p)
      out.push(f)
    }
  }
  return out
}
