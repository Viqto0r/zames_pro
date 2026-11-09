import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatContextSources } from '../src/commands.ts'
import { translate } from '../src/i18n.ts'

const NL = String.fromCharCode(10)
const t = translate('en')
const ru = translate('ru')

// /context prints what was loaded into the system prompt. Every value comes
// from the operator's PROJECT (paths, skill names, command names) or from a
// DISK read (content), so the edges are: a newline in a name faking a report
// row, a missing content throwing out of the whole command, and a NaN size
// looking like a bug in the report itself.

const rows = (out: string): string[] => out.split(NL)

test('every section is listed with its (none) placeholder', () => {
  const out = formatContextSources([], [], [], [], {}, t)
  assert.deepEqual(rows(out), [
    'Loaded into the prompt:',
    'AGENTS.md / instructions:',
    '  (none)',
    'MEMORY.md:',
    '  (none)',
    'Skills:',
    '  (none)',
    'Custom commands:',
    '  (none)',
  ])
})

test('the system-prompt line appears only for a finite number', () => {
  const withSize = formatContextSources(
    [],
    [],
    [],
    [],
    { systemPromptChars: 1234 },
    t,
  )
  assert.ok(rows(withSize).includes('  system prompt: 1234 chars'))
  // A missing size omits the line; a NaN/Infinity one does too (a MEASUREMENT
  // failure is not a size and must not look like a report bug).
  assert.ok(
    !formatContextSources([], [], [], [], {}, t).includes('system prompt'),
  )
  for (const bad of [NaN, Infinity, -Infinity]) {
    const out = formatContextSources(
      [],
      [],
      [],
      [],
      { systemPromptChars: bad },
      t,
    )
    assert.ok(!out.includes('system prompt'), String(bad))
  }
})

test('a file row counts the text and treats a missing content as empty', () => {
  const out = formatContextSources(
    [{ path: 'AGENTS.md', content: 'abc' }],
    [{ path: 'MEMORY.md', content: 'de' }],
    [],
    [],
    {},
    t,
  )
  assert.ok(out.includes('  AGENTS.md  (3 chars)'))
  assert.ok(out.includes('  MEMORY.md  (2 chars)'))
  // A failed/empty read hands `undefined` (or an object) — that used to THROW
  // out of the whole command; it now counts as zero chars.
  const broken = formatContextSources(
    [{ path: 'AGENTS.md', content: undefined as never }],
    [{ path: 'MEMORY.md', content: {} as never }],
    [],
    [],
    {},
    t,
  )
  assert.ok(broken.includes('  AGENTS.md  (0 chars)'))
  assert.ok(broken.includes('  MEMORY.md  (0 chars)'))
  assert.ok(!broken.includes('undefined'))
})

test('skills print the name and, when known, the path', () => {
  const out = formatContextSources(
    [],
    [],
    [{ name: 'review', path: 'skills/review/SKILL.md' }, { name: 'plain' }],
    [],
    {},
    t,
  )
  assert.ok(out.includes('  review  skills/review/SKILL.md'))
  assert.ok(rows(out).includes('  plain'))
  // The DESCRIPTION is not printed in this report.
  const withDesc = formatContextSources(
    [],
    [],
    [{ name: 'x', description: 'D' }],
    [],
    {},
    t,
  )
  assert.ok(!withDesc.includes('D'))
})

test('custom commands print with a leading slash', () => {
  const out = formatContextSources([], [], [], [{ name: 'deploy' }], {}, t)
  assert.ok(rows(out).includes('  /deploy'))
})

test('a newline in a path or a name cannot fake a report row', () => {
  const out = formatContextSources(
    [{ path: 'AGENTS.md' + NL + 'FAKE ROW', content: 'x' }],
    [],
    [{ name: 'a' + NL + 'b' }],
    [{ name: 'cmd' + NL + 'FAKE' }],
    {},
    t,
  )
  // Every injected line is COLLAPSED into its own row instead of starting a
  // new one.
  assert.ok(!rows(out).includes('FAKE ROW'))
  assert.ok(!rows(out).includes('FAKE'))
  assert.ok(out.includes('AGENTS.md FAKE ROW  (1 chars)'))
  assert.ok(rows(out).includes('  a b'))
  assert.ok(rows(out).includes('  /cmd FAKE'))
})

test('the report is localized', () => {
  const en = formatContextSources([], [], [], [], {}, t)
  const ruOut = formatContextSources([], [], [], [], {}, ru)
  assert.notEqual(en, ruOut)
  assert.equal(rows(ruOut)[0], ru('context.title'))
  assert.equal(ru('context.title'), 'Загружено в промпт:')
})

test('the sections keep their fixed order regardless of the input', () => {
  const out = formatContextSources(
    [{ path: 'A', content: '' }],
    [{ path: 'M', content: '' }],
    [{ name: 'S' }],
    [{ name: 'C' }],
    {},
    t,
  )
  const order = [
    'Loaded into the prompt:',
    'AGENTS.md / instructions:',
    'MEMORY.md:',
    'Skills:',
    'Custom commands:',
  ]
  let last = -1
  for (const head of order) {
    const at = rows(out).indexOf(head)
    assert.ok(at > last, head)
    last = at
  }
})
