import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadSkills } from '../src/context.ts'

// Regression: AGENTS.md promises "SKILL.md files, discovered up to 3 levels
// deep under <workdir>/.zames/skills/...", but findSkillFiles() started the
// walk at level 1 and only descended while `level < depth` (3), so a skill at
// the THIRD level (`skills/a/b/three/SKILL.md`, the very shape
// `.zames/skills/<category>/<group>/<skill>/SKILL.md`) was never found.

async function tmpRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'zames-skilldepth-'))
}

async function mkSkill(root: string, rel: string): Promise<void> {
  const dir = path.join(root, rel)
  await fs.mkdir(dir, { recursive: true })
  const name = 'skill-' + rel.replace(/[^a-z0-9]/gi, '-')
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    '---\nname: ' + name + '\ndescription: d\n---\nbody',
    'utf-8',
  )
}

async function projectSkills(root: string): Promise<string[]> {
  const skills = await loadSkills(root)
  return skills
    .filter((s) => s.source === 'project')
    .map((s) => path.relative(root, s.path).split(path.sep).join('/'))
}

test('a skill at depth 1 and 2 is discovered', async () => {
  const root = await tmpRoot()
  await mkSkill(root, '.zames/skills/one')
  await mkSkill(root, '.zames/skills/a/two')
  const found = await projectSkills(root)
  assert.ok(found.includes('.zames/skills/one/SKILL.md'), found.join(','))
  assert.ok(found.includes('.zames/skills/a/two/SKILL.md'), found.join(','))
})

test('a skill at depth 3 IS discovered (up to 3 levels deep)', async () => {
  const root = await tmpRoot()
  await mkSkill(root, '.zames/skills/a/b/three')
  const found = await projectSkills(root)
  assert.ok(
    found.includes('.zames/skills/a/b/three/SKILL.md'),
    'depth-3 skill was not discovered: ' + found.join(','),
  )
})

test('a skill deeper than 3 levels is NOT discovered (bounded walk)', async () => {
  const root = await tmpRoot()
  await mkSkill(root, '.zames/skills/a/b/c/four')
  const found = await projectSkills(root)
  assert.deepEqual(found, [])
})
