import fs from 'fs/promises'
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
}

export interface CustomCommand {
  name: string
  description: string
  path: string
  body: string
}

export interface LoadedContext {
  agents: ContextFile[]
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
  return cleaned.slice(0, keep) + NL + NL + '[... ' + name + ' truncated (' + (cleaned.length - keep) + ' chars omitted) ...]'
}

async function readIfFile(p: string, budget: number): Promise<ContextFile | null> {
  try {
    const st = await fs.stat(p)
    if (!st.isFile()) return null
    const raw = await fs.readFile(p, 'utf-8')
    const content = clipIf(path.basename(p), raw, budget)
    if (!content) return null
    return { path: p, content }
  } catch {
    return null
  }
}

const AGENT_NAMES = ['AGENTS.md', 'agents.md', 'Agents.md']
const MEMORY_NAMES = ['MEMORY.md', 'memory.md', 'Memory.md']

async function findNamedFile(dir: string, names: string[]): Promise<string | null> {
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
}

const PROJECT_SKILL_DIRS = ['.zames/skills', '.claude/skills', '.agents/skills', 'skills']

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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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
      ? out['allowed-tools'].split(/,/).map((s) => s.trim()).filter(Boolean)
      : undefined
  const userInvokable =
    typeof out['user-invokable'] === 'string'
      ? out['user-invokable'].toLowerCase() !== 'false'
      : undefined
  return { name: out.name, description: out.description, allowedTools, userInvokable }
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
  roots.push({ dir: path.join(os.homedir(), '.zames', 'skills'), source: 'global' })
  roots.push({ dir: path.join(os.homedir(), '.claude', 'skills'), source: 'global' })
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
      found.push({ name, description, path: f, dir, allowedTools: fm.allowedTools, source: root.source, userInvokable: fm.userInvokable !== false })
    }
  }
  found.sort((a, b) => a.name.localeCompare(b.name))
  return found
}

const PROJECT_COMMAND_DIRS = ['.zames/commands', '.claude/commands', '.agents/commands']

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
    out.push({ name, description: (fm.description || '').replace(/\s+/g, ' ').trim(), path: full, body: skillBody(raw) })
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
  for (const p of [path.join(os.homedir(), '.zames', 'AGENTS.md'), path.join(os.homedir(), '.claude', 'CLAUDE.md')]) {
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
  for (const p of [path.join(os.homedir(), '.zames', 'MEMORY.md'), path.join(os.homedir(), '.claude', 'MEMORY.md')]) {
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

export async function loadProjectContext(workdir: string): Promise<LoadedContext> {
  const [agents, memory, skills, commands] = await Promise.all([
    loadAgentsChain(workdir).catch(() => []),
    loadMemoryChain(workdir).catch(() => []),
    loadSkills(workdir).catch(() => []),
    loadCommands(workdir).catch(() => []),
  ])
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
  return { agents: withinBudget(agents), memory: withinBudget(memory), skills, commands }
}
