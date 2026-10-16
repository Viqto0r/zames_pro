import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSystemPrompt } from '../src/system-prompt.ts'
import type { LoadedContext } from '../src/context.ts'

// The `## Skills` section is progressive disclosure: the model sees the
// frontmatter (name + description + file path) of every discovered skill, and
// must be TOLD to read a matching body before a non-trivial task — otherwise a
// list of skills is dead weight in the prompt. This pins the discipline text
// so a refactor cannot silently drop it.

function ctx(skills: LoadedContext['skills']): LoadedContext {
  return {
    agents: [],
    memory: [],
    scopedAgents: [],
    skills,
    commands: [],
  } as unknown as LoadedContext
}

const SKILL: LoadedContext['skills'][number] = {
  name: 'systematic-debugging',
  description: 'Use when something is broken.',
  path: '/proj/.zames/skills/systematic-debugging/SKILL.md',
  dir: '/proj/.zames/skills/systematic-debugging',
  source: 'project',
  userInvokable: true,
}

test('the Skills section lists the file path so the body can be read', () => {
  const sp = buildSystemPrompt({
    workdir: '/proj',
    tools: [],
    context: ctx([SKILL]),
    locale: 'en',
  })
  assert.ok(sp.includes('## Skills'))
  assert.ok(sp.includes('systematic-debugging'))
  assert.ok(sp.includes(SKILL.path))
})

test('the Skills section tells the model to READ a matching skill first', () => {
  const sp = buildSystemPrompt({
    workdir: '/proj',
    tools: [],
    context: ctx([SKILL]),
    locale: 'en',
  })
  // The discipline paragraph (the zames stand-in for superpowers'
  // using-superpowers bootstrap) must be present AND narrow: it applies to a
  // non-trivial task and explicitly exempts a trivial edit, so the model does
  // not burn iterations reading SKILL.md files for a one-line change.
  assert.ok(
    sp.includes('Before starting a NON-TRIVIAL task'),
    'the skills discipline must be in the prompt',
  )
  assert.ok(
    sp.includes('Skip this\nfor a trivial edit') ||
      sp.includes('Skip this for a trivial edit'),
    'the discipline must exempt a trivial edit',
  )
})

test('no Skills section when no skill is discovered', () => {
  const sp = buildSystemPrompt({
    workdir: '/proj',
    tools: [],
    context: ctx([]),
    locale: 'en',
  })
  assert.ok(!sp.includes('## Skills'))
  assert.ok(!sp.includes('Before starting a NON-TRIVIAL task'))
})
