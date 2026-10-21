import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.ts'
import { loadSkills } from '../src/context.ts'
import { createTools, filterToolsByAllowList } from '../src/tools.ts'

// A skill's `allowed-tools:` is a COMMA list per the Claude Code contract, but
// a hand-written SKILL.md often uses a plain SPACE-separated list. The parser
// only split on commas, so `allowed-tools: Read Bash Grep` became ONE name
// 'Read Bash Grep' - no tool matched and the skill could only call respond.
// The tool filter is a safety gate, so this is not a cosmetic issue: the
// operator's skill silently lost every tool it declared.
test('allowed-tools splits a space-separated list', async (t) => {
  const dir = await makeTmpDir(t, 'zames-skill-tools-')
  const skillDir = path.join(dir, '.zames', 'skills', 'ro')
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: ro\ndescription: x\nallowed-tools: Read Bash Grep\n---\nbody',
  )
  const skills = await loadSkills(dir)
  const ro = skills.find((s) => s.name === 'ro')
  assert.ok(ro, 'the skill must be discovered')
  assert.deepEqual(ro!.allowedTools, ['Read', 'Bash', 'Grep'])

  const tools = filterToolsByAllowList(
    createTools(dir, {}),
    ro!.allowedTools,
  ).map((s) => s.name)
  assert.deepEqual(tools.sort(), ['Bash', 'Grep', 'Read', 'respond'])
})

test('allowed-tools still splits a comma list and trims', async (t) => {
  const dir = await makeTmpDir(t, 'zames-skill-tools-')
  const skillDir = path.join(dir, '.zames', 'skills', 'ro')
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: ro\ndescription: x\nallowed-tools: Read, Grep\n---\nbody',
  )
  const skills = await loadSkills(dir)
  assert.deepEqual(skills.find((s) => s.name === 'ro')!.allowedTools, [
    'Read',
    'Grep',
  ])
})
