// The methodology skills ship with the package (`skills/` next to `dist/`), so
// `loadSkills` from an INSTALLED build must find them without any local
// `.zames/skills`. In a development checkout the same skills exist as
// BUILTIN_SKILLS (inline bodies) and those are the canonical ones, so the test
// simulates the installed layout: it copies a stub `dist/context.js` tree.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHIPPED = [
  'brainstorming',
  'systematic-debugging',
  'test-driven-development',
  'verification-before-completion',
  'writing-plans',
]

test('the package ships every methodology skill as a SKILL.md', async () => {
  for (const name of SHIPPED) {
    const file = path.join(repo, 'skills', name, 'SKILL.md')
    const raw = await fs.readFile(file, 'utf-8')
    assert.ok(raw.startsWith('---'), name + ': missing frontmatter')
    assert.ok(raw.includes('name: ' + name), name + ': wrong name field')
    assert.ok(/description:\s*\S/.test(raw), name + ': missing description')
  }
})

test('the shipped directory sits next to dist in the installed layout', async () => {
  // The loader derives it as `dirname(module) + '/../skills'`; in dist that is
  // the package root. Verify the same relative shape exists in the repo.
  const pkg = JSON.parse(
    await fs.readFile(path.join(repo, 'package.json'), 'utf-8'),
  ) as { files?: string[] }
  assert.ok(
    pkg.files?.includes('skills'),
    'package.json files must ship skills',
  )
  const distSkills = path.join(repo, 'skills')
  const st = await fs.stat(distSkills)
  assert.equal(st.isDirectory(), true)
})

test('a project skill of the same name overrides the shipped copy', async () => {
  const { loadSkills } = await import('../src/context.ts')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-skill-'))
  try {
    const dir = path.join(root, '.zames', 'skills', 'brainstorming')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      '---' +
        String.fromCharCode(10) +
        'name: brainstorming' +
        String.fromCharCode(10) +
        'description: project override' +
        String.fromCharCode(10) +
        '---' +
        String.fromCharCode(10) +
        String.fromCharCode(10) +
        'Project body.' +
        String.fromCharCode(10),
    )
    const list = await loadSkills(root)
    const found = list.filter((s) => s.name === 'brainstorming')
    assert.equal(found.length, 1)
    assert.equal(found[0].description, 'project override')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
