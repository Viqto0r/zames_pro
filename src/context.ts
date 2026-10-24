import fs from 'fs/promises'
import { statSync } from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

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
  // Methodology skills, ported from superpowers (github.com/obra/superpowers)
  // as plain prompt bodies — the zames equivalent of its SessionStart
  // bootstrap, without a hook. The model is nudged to read the matching one
  // before a non-trivial task by SKILLS_DISCIPLINE (src/system-prompt.ts).
  // Baked in (not a file on disk) so a user who installed the npm package has
  // them out of the box; a project skill of the same name overrides them.
  {
    name: 'brainstorming',
    description:
      'Use when the request is a GOAL, not a spec — "add X", "make it better", "integrate Y" — and it is unclear what "done" means.',
    body:
      'When a request is a goal ("make scrolling feel right"), building ' +
      'immediately produces the wrong thing fast. First make the intent concrete.\n' +
      'Pin down: (a) the REAL outcome — what should be TRUE after that is not ' +
      'true now; (b) the acceptance check — how the operator will know it works; ' +
      '(c) scope edges — what is explicitly NOT part of this; (d) the ' +
      'alternatives considered and why you chose one.\n' +
      'zames has NO conversational turn: the operator sees only your final ' +
      'respond. So do the brainstorming YOURSELF and return a SHORT, concrete ' +
      'proposal in ONE respond — the goal as you understood it, your ' +
      'assumptions and defaults, what you will NOT do — then either proceed if ' +
      'the request was clearly actionable, or stop and ask the ONE decision you ' +
      'genuinely cannot make alone. For an already-precise request ("read X", ' +
      '"rename Y") skip this entirely.',
  },
  {
    name: 'writing-plans',
    description:
      'Use when a task needs more than one or two tool calls — a multi-file change, a new feature, a refactor. Breaks it into small ordered steps with exact paths and a verification for each.',
    body:
      'A plan is a sequence of steps a careful engineer with NO project ' +
      'context could follow. Each step (2-5 minutes) names: the EXACT file ' +
      'path(s); the concrete edit; how to verify it (command, test name, ' +
      'expected output). Order matters: put the step that DE-RISKS the task ' +
      'first (a spike, a failing test, a proof the API works) — do not build ' +
      'three layers on an unverified assumption.\n' +
      'Rules: one concern per step ("add the flag AND refactor the caller" is ' +
      'two); prefer a step that FAILS LOUDLY over one that silently ' +
      'half-works; every behavioural change gets a test step (see ' +
      'test-driven-development); if a step turns out wrong, STOP and revise the ' +
      'plan instead of improvising; a 30-step plan means the task should be ' +
      'split. In zames the plan lives in your reasoning and, for a long task, ' +
      'in a TodoWrite list — one entry per step. Do not narrate it between tool ' +
      'calls; the todo list IS the visible plan.',
  },
  {
    name: 'test-driven-development',
    description:
      'Use when writing or changing testable behaviour — a bug fix, a new function, a parser, a formatter. Write the failing test first, watch it fail, then make it pass.',
    body:
      'RED -> GREEN -> REFACTOR. The order is the point, not a formality.\n' +
      '1. RED — write the smallest test that expresses the new behaviour and ' +
      'RUN it. It must FAIL for the RIGHT reason ("not implemented", not a ' +
      'typo). A test you never saw fail proves nothing.\n' +
      '2. GREEN — write the MINIMUM code that makes it pass; do not add the ' +
      'next feature "while you are there".\n' +
      '3. REFACTOR — clean up with the test green, then re-run.\n' +
      'A good test asserts BEHAVIOUR (input -> output), is deterministic (no ' +
      'sleeps, no network, no wall-clock or test-order dependence) and fails ' +
      'for ONE reason with a message that says what broke. In this project a ' +
      'bug fix ALWAYS gets a regression test reproducing the original bug. ' +
      'When a test needs fixing, ask whether the TEST or the CODE was wrong; ' +
      'if the code was written before its test, rewrite it driven by the test.',
  },
  {
    name: 'systematic-debugging',
    description:
      'Use when something is broken and the cause is not obvious — a failing test, a wrong result, a hang, a crash. Four phases: reproduce, isolate, hypothesize, fix.',
    body:
      'Do NOT start by editing code. Work the four phases in order; each ' +
      'produces an artifact you can point at.\n' +
      '1. REPRODUCE — get a command that FAILS the way the operator describes; ' +
      'copy the exact error. If it passes you do not have the bug yet: narrow ' +
      'the input until it fails.\n' +
      '2. ISOLATE — shrink to the smallest failing unit (bisect, stub, ' +
      'binary-search). Read the code the failing path ACTUALLY executes. Check ' +
      'the obvious first: wrong file, stale build, cached state, different ' +
      'config, an error swallowed by a catch.\n' +
      '3. HYPOTHESIZE — state it in one sentence and predict what you should ' +
      'see if it is right; test exactly that. One change at a time; prefer an ' +
      'observation (log, test assertion) over an edit. If the prediction is ' +
      'wrong, DISCARD the hypothesis.\n' +
      '4. FIX AND VERIFY — fix the CAUSE, not the symptom; add a regression ' +
      'test that fails WITHOUT the fix; re-run the phase-1 reproduction ' +
      'verbatim; look for the same bug elsewhere.\n' +
      'Anti-patterns: editing before reproducing; "it works now" without ' +
      'knowing what changed; silencing an error you do not understand with a ' +
      'try/catch; trusting a green test never seen red.',
  },
  {
    name: 'verification-before-completion',
    description:
      'Use BEFORE declaring a task done — a feature, a bug fix, a generated file. Forces you to run the verification you promised instead of trusting the code looks right.',
    body:
      '"It should work" is not done. Before reporting success, produce ' +
      'EVIDENCE from the real artifact, not from your intent.\n' +
      '1. Re-read the original request; tick every requirement (including the ' +
      'ones in a parenthetical) against something you can show.\n' +
      '2. Run the thing: build/typecheck/tests for code; run a script; for a ' +
      'generated file, open/parse it and confirm it is COMPLETE, not ' +
      'truncated; for a UI, the real screen, not the diff.\n' +
      '3. Re-read your own diff as a reviewer: leftover debug output, dead ' +
      'code, a wrong path, a test that asserts nothing.\n' +
      '4. State the evidence in the final report — the exact command and its ' +
      'result — so the operator can reproduce it. "Tests pass" without the ' +
      'command is not evidence.\n' +
      'If you cannot run the verification, SAY SO explicitly and describe what ' +
      'you did instead; never report "done" implying a check you did not run.',
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

// Per-file budgets. AGENTS.md/MEMORY.md are hand-maintained and grow over
// time, so the caps are generous: an AGENTS.md of a real project (this repo's
// own file is ~69k) must NOT be silently cut. The old 60k cap already
// truncated it. Set higher and split per kind so a huge AGENTS.md can no
// longer starve MEMORY.md of the shared pool (the old single pool filled on
// agents first, so memory was dropped WHOLE when agents were large).
export const MAX_FILE_BASE = 120000
/** MEMORY.md is append-only, so it gets its own (larger) budget. */
export const MAX_MEMORY_FILE = 200000
/** Total spent on the AGENTS.md chain (project instructions + scoped). */
const MAX_AGENTS_TOTAL = 240000
/** Total spent on the MEMORY.md chain, independent of the agents pool. */
const MAX_MEMORY_TOTAL = 200000

const CRLF_RE = /\r\n/g
const NL = String.fromCharCode(10)

function clipIf(
  name: string,
  content: string,
  budget: number,
  fromTail = false,
): string {
  const cleaned = content.replace(CRLF_RE, NL).trim()
  if (cleaned.length <= budget) return cleaned
  const keep = Math.max(0, budget - 120)
  const marker =
    '[... ' +
    name +
    ' truncated (' +
    (cleaned.length - keep) +
    ' chars omitted) ...]'
  // MEMORY.md is APPENDED to over time, so its newest (most relevant) notes
  // live at the TAIL — a head clip would drop exactly those. Keep the tail
  // for memory files, the head for AGENTS.md (whose top is the summary).
  //
  // The cut is in UTF-16 units, so it can land BETWEEN the halves of a
  // surrogate PAIR (an emoji / astral CJK char): the head would then end with
  // a lone HIGH half and the tail would START with a lone LOW half. Both reach
  // the model through the system prompt as broken code points (the same rule
  // as truncateToolResult / capReport / cutHookText). Step one unit back for
  // the head, one unit forward for the tail, so the pair is dropped whole.
  if (!fromTail) {
    let end = keep
    const last = cleaned.charCodeAt(end - 1)
    if (last >= 0xd800 && last <= 0xdbff) end--
    return cleaned.slice(0, end) + NL + NL + marker
  }
  let start = cleaned.length - keep
  const first = cleaned.charCodeAt(start)
  if (first >= 0xdc00 && first <= 0xdfff) start++
  let slice = cleaned.slice(start)
  // Cut at a NOTE boundary, not mid-note: start the kept tail at the next line
  // that begins a bullet or a heading, so a half-sentence note is not left.
  const m = slice.search(/\n(?=[-*] |#{1,6} )/)
  if (m > 0) slice = slice.slice(m + 1)
  return marker + NL + NL + slice
}

async function readIfFile(
  p: string,
  budget: number,
  fromTail = false,
): Promise<ContextFile | null> {
  try {
    const st = await fs.stat(p)
    if (!st.isFile()) return null
    const raw = await fs.readFile(p, 'utf-8')
    // An EXISTING but empty file is still present: keep it so the prompt
    // shows an (empty) AGENTS.md/MEMORY.md section instead of silently
    // dropping the file. Only a read failure returns null.
    const content = clipIf(path.basename(p), raw, budget, fromTail)
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
  // A leading BOM must be dropped BEFORE the `---` check: Windows editors and
  // generators write one, and without this the frontmatter was not recognised
  // at all (description / argument-hint / arguments silently lost).
  // `skillBody` already strips it; the two must agree.
  const bom = String.fromCharCode(0xfeff)
  const norm = String(raw ?? '')
    .replace(new RegExp('^' + bom), '')
    .replace(CRLF_RE, NL)
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
      ? // A comma list is the documented form, but a hand-written SKILL.md
        // often uses plain spaces (`allowed-tools: Read Bash Grep`). Splitting
        // on commas alone made that ONE name, no tool matched, and the skill
        // could only call respond.
        out['allowed-tools']
          .split(/[,\s]+/)
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
  // A leading BOM (some Windows editors and generators write one) makes the
  // text NOT start with `---`, so the frontmatter check below missed it and
  // the model got the raw YAML mixed into the instructions. Drop it first.
  const bom = String.fromCharCode(0xfeff)
  const norm = String(raw ?? '')
    .replace(new RegExp('^' + bom), '')
    .replace(CRLF_RE, NL)
  if (!norm.startsWith('---')) return norm.trim()
  const end = norm.indexOf(NL + '---', 3)
  if (end === -1) return norm.trim()
  // The closing `---` may be the LAST line with no trailing newline; then
  // indexOf(NL, …) is -1 and slice(0) returned the WHOLE file (frontmatter
  // included). Guard the -1 -> the body is everything after the closing ---.
  const after = norm.indexOf(NL, end + 1)
  if (after === -1) {
    // No newline after the closing delimiter: the body is empty (or just the
    // rest of that final line, which IS the `---`).
    const rest = norm.slice(end + 1)
    return rest.replace(/^-*$/, '').trim()
  }
  return norm.slice(after + 1).trim()
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
  // Start at level 0 so `level < depth` admits exactly `depth` levels of
  // subdirectories: with walk(root, 1) the FIRST level counted as 1 and the
  // walk stopped one level early, so a skill at the documented "3 levels
  // deep" (`.zames/skills/<a>/<b>/<skill>/SKILL.md`) was never discovered.
  await walk(root, 0)
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
  // The skills SHIPPED with the package. In the installed layout they sit next
  // to `dist/`; in a development checkout that path resolves INSIDE the repo
  // (`src/../skills`), where the same skills also exist as files. The built-in
  // copies (BUILTIN_SKILLS, appended below with an inline body) are the
  // canonical ones — adding the files here would override them and break
  // `/skill-name` expansion and the offline docs. So only add the directory when
  // the module runs from the built `dist/` layout.
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  if (!moduleDir.endsWith(path.sep + 'src')) {
    roots.push({
      dir: path.join(moduleDir, '..', 'skills'),
      source: 'global',
    })
  }
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
    // Memory is append-only, so clip from the TAIL to keep the newest notes.
    const f = await readIfFile(p, MAX_MEMORY_FILE, true)
    if (f && !seen.has(f.path)) {
      seen.add(f.path)
      out.push(f)
    }
  }
  const chain = dirChainFromRoot(workdir)
  for (const dir of chain) {
    const p = await findNamedFile(dir, MEMORY_NAMES)
    if (!p || seen.has(p)) continue
    const f = await readIfFile(p, MAX_MEMORY_FILE, true)
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
  // SEPARATE pools for agents and memory: the old single pool filled on the
  // agents chain first, so a large AGENTS.md dropped MEMORY.md WHOLE. Each
  // category now has its own budget, and memory can never be starved by
  // project instructions (or vice versa).
  const takeWithin = (files: ContextFile[], total: number): ContextFile[] => {
    let used = 0
    const kept: ContextFile[] = []
    for (const f of files) {
      // SKIP a file that does not fit the remaining pool, do NOT end the
      // chain: the chain runs global -> root -> ... -> workdir, so one large
      // file used to drop every SMALLER, MORE SPECIFIC file after it — the
      // most specific instructions are exactly the ones lost.
      if (used + f.content.length > total) continue
      used += f.content.length
      kept.push(f)
    }
    return kept
  }
  const keptAgents = takeWithin(agents, MAX_AGENTS_TOTAL)
  const agentsUsed = keptAgents.reduce((n, f) => n + f.content.length, 0)
  const keptScoped = takeWithin(scopedAgents, MAX_AGENTS_TOTAL - agentsUsed)
  return {
    agents: keptAgents,
    // Scoped files are dropped silently when the AGENTS pool is already spent
    // on the main chain: a nested AGENTS.md is an optimization, not a hard
    // requirement, and must never push out a top-level instruction.
    scopedAgents: keptScoped,
    memory: takeWithin(memory, MAX_MEMORY_TOTAL),
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
    // Walk from the deepest directory that actually exists up to the root. A
    // token that names a FILE (`sub/file.ts`) is not a directory: starting the
    // climb at it never found a directory and the scoped rules were silently
    // dropped for the most common way to name a file in a task.
    let dir = abs
    let st = statSyncSafe(dir)
    if (st && !st.isDirectory()) {
      dir = path.dirname(dir)
      st = statSyncSafe(dir)
    }
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
    // AGENTS.md is head-clipped; MEMORY.md is append-only so it uses the
    // memory budget and keeps its TAIL (same rule as the main memory chain) —
    // otherwise the newest notes in a large nested MEMORY.md were lost.
    for (const names of [AGENT_NAMES, MEMORY_NAMES]) {
      const isMemory = names === MEMORY_NAMES
      const p = await findNamedFile(dir, names)
      if (!p || seen.has(p)) continue
      const f = isMemory
        ? await readIfFile(p, MAX_MEMORY_FILE, true)
        : await readIfFile(p, MAX_FILE_BASE)
      if (!f) continue
      seen.add(p)
      out.push(f)
    }
  }
  return out
}
