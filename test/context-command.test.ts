import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderContextReport } from '../src/context-command.js'
import { translate } from '../src/i18n.js'

const t = translate('en')

test('renderContextReport: no files at all renders four empty sections', () => {
  const out = renderContextReport(
    { agents: [], memory: [], skills: [], commands: [] },
    {},
    t,
  )
  // Title + 4 sections, each empty section says "(none)".
  const noneCount = out.split('(none)').length - 1
  assert.equal(noneCount, 4)
})

test('renderContextReport: char counters reflect the TRUNCATED content length', () => {
  const out = renderContextReport(
    {
      agents: [{ path: 'AGENTS.md', content: 'abcde' }],
      memory: [],
      skills: [],
      commands: [],
    },
    {},
    t,
  )
  assert.match(out, /AGENTS\.md {2}\(5 chars\)/)
})

test('renderContextReport: the system-prompt size is printed only when given', () => {
  const base = { agents: [], memory: [], skills: [], commands: [] }
  assert.ok(!/system prompt/i.test(renderContextReport(base, {}, t)))
  assert.match(
    renderContextReport(base, { systemPromptChars: 1234 }, t),
    /1234/,
  )
})

test('renderContextReport: a zero system-prompt size is still printed', () => {
  const out = renderContextReport(
    { agents: [], memory: [], skills: [], commands: [] },
    { systemPromptChars: 0 },
    t,
  )
  assert.match(out, /0/)
})

test('renderContextReport: skills and commands are listed by name', () => {
  const out = renderContextReport(
    {
      agents: [],
      memory: [],
      skills: [{ name: 'brainstorming', path: '/s/SKILL.md' }],
      commands: [{ name: 'commit' }],
    },
    {},
    t,
  )
  assert.match(out, /brainstorming/)
  assert.match(out, /\/commit/)
})

test('renderContextReport: missing arrays do not throw', () => {
  const out = renderContextReport(
    {} as unknown as {
      agents: []
      memory: []
      skills: []
      commands: []
    },
    {},
    t,
  )
  assert.equal(out.split('(none)').length - 1, 4)
})
