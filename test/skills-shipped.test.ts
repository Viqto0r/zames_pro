// The methodology skills must SHIP with the package. They used to live only in
// `.zames/skills`, which `.gitignore` excludes — the operator's own checkout had
// them, but a user who installed zames from npm got none of them.
//
// This test pins the shipping contract: the tracked `skills/` directory is
// listed in package.json `files` and every skill there is a valid SKILL.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS = [
  'brainstorming',
  'systematic-debugging',
  'test-driven-development',
  'verification-before-completion',
  'writing-plans',
]

test('package.json ships the skills directory', async () => {
  const pkg = JSON.parse(
    await fs.readFile(path.join(root, 'package.json'), 'utf-8'),
  ) as { files?: string[] }
  assert.ok(Array.isArray(pkg.files))
  assert.ok(pkg.files!.includes('skills'), 'files must contain "skills"')
})

test('every methodology skill exists with frontmatter', async () => {
  for (const name of SKILLS) {
    const file = path.join(root, 'skills', name, 'SKILL.md')
    const raw = await fs.readFile(file, 'utf-8')
    assert.ok(raw.startsWith('---'), name + ': missing frontmatter')
    assert.ok(raw.includes('name: ' + name), name + ': wrong name field')
  }
})

test('.gitignore does not exclude the shipped skills directory', async () => {
  const gi = await fs.readFile(path.join(root, '.gitignore'), 'utf-8')
  const lines = gi.split(String.fromCharCode(10)).map((l) => l.trim())
  assert.equal(lines.includes('skills'), false)
})
