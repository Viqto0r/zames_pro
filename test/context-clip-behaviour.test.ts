import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  loadProjectContext,
  MAX_FILE_BASE,
  MAX_MEMORY_FILE,
} from '../src/context.ts'
import { makeTmpDir } from './tmp-dir.ts'

// test/context-clip-surrogate.test.ts pins ONE rule of `clipIf` (a head clip
// must not end on a lone high surrogate). The rest of the clip was unpinned:
// WHICH END is kept for which file, the omission marker, the tail's
// note-boundary snap, and the empty-file case. Getting the direction wrong
// silently drops the newest MEMORY.md notes — the ones that matter.

const NL = String.fromCharCode(10)

async function mk(root: string, rel: string, body: string): Promise<void> {
  const p = path.join(root, rel)
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, body)
}

const marker = (name: string, omitted: number): string =>
  '[... ' + name + ' truncated (' + omitted + ' chars omitted) ...]'

test('a small AGENTS.md is kept verbatim (CRLF normalized, trimmed)', async (t) => {
  const root = await makeTmpDir(t, 'zames-clip-')
  await mk(root, 'AGENTS.md', '  rule one\r\nrule two  ')
  const ctx = await loadProjectContext(root)
  const own = ctx.agents.find((f) => f.path === path.join(root, 'AGENTS.md'))
  assert.ok(own)
  assert.equal(own.content, 'rule one' + NL + 'rule two')
})

test('an EMPTY AGENTS.md is still loaded (not silently dropped)', async (t) => {
  const root = await makeTmpDir(t, 'zames-clip-')
  await mk(root, 'AGENTS.md', '')
  const ctx = await loadProjectContext(root)
  const own = ctx.agents.find((f) => f.path === path.join(root, 'AGENTS.md'))
  assert.ok(own, 'an existing but empty AGENTS.md must stay in the chain')
  assert.equal(own.content, '')
})

test('a big AGENTS.md keeps its HEAD and marks the omission', async (t) => {
  const root = await makeTmpDir(t, 'zames-clip-')
  const body = 'HEAD-RULE ' + 'a'.repeat(MAX_FILE_BASE + 1000) + ' TAIL-RULE'
  await mk(root, 'AGENTS.md', body)
  const ctx = await loadProjectContext(root)
  const own = ctx.agents.find((f) => f.path === path.join(root, 'AGENTS.md'))
  assert.ok(own)
  assert.match(own.content, /^HEAD-RULE /)
  assert.ok(!own.content.includes('TAIL-RULE'), 'the tail must be cut')
  const m = own.content.match(
    /\[\.\.\. AGENTS\.md truncated \((\d+) chars omitted\) \.\.\.\]/,
  )
  assert.ok(m, 'the omission marker is missing: ' + own.content.slice(-120))
  // The whole clipped text stays within the budget.
  assert.ok(own.content.length <= MAX_FILE_BASE)
})

test('a big MEMORY.md keeps its TAIL — the newest notes', async (t) => {
  const root = await makeTmpDir(t, 'zames-clip-')
  const head = 'OLD-STUFF ' + 'z'.repeat(MAX_MEMORY_FILE + 5000)
  const body =
    head + NL + NL + '- OLD NOTE' + NL + '- NEWEST NOTE' + NL + '- last'
  await mk(root, 'MEMORY.md', body)
  const ctx = await loadProjectContext(root)
  const own = ctx.memory.find((f) => f.path === path.join(root, 'MEMORY.md'))
  assert.ok(own)
  assert.match(
    own.content,
    /^\[\.\.\. MEMORY\.md truncated \(\d+ chars omitted\) \.\.\.\]/,
  )
  assert.match(own.content, /- NEWEST NOTE/)
  assert.match(own.content, /- last$/)
  assert.ok(!own.content.includes('OLD-STUFF'), 'the head must be cut')
  assert.ok(own.content.length <= MAX_MEMORY_FILE)
})

test('the kept MEMORY tail starts at a NOTE boundary, not mid-sentence', async (t) => {
  const root = await makeTmpDir(t, 'zames-clip-')
  // One huge bullet, then a clean bullet: the cut lands inside the first one,
  // and the kept tail must snap to the next `- ` line.
  const body =
    'x'.repeat(MAX_MEMORY_FILE) +
    NL +
    '- ' +
    'y'.repeat(2000) +
    NL +
    '- CLEAN NOTE' +
    NL +
    '## HEADING NOTE'
  await mk(root, 'MEMORY.md', body)
  const ctx = await loadProjectContext(root)
  const own = ctx.memory.find((f) => f.path === path.join(root, 'MEMORY.md'))
  assert.ok(own)
  const kept =
    own.content.split(marker('MEMORY.md', 0).slice(0, 12))[1] ?? own.content
  assert.ok(kept.includes('- CLEAN NOTE') || kept.includes('## HEADING NOTE'))
  // The kept body never STARTS in the middle of the long bullet.
  const afterMarker = own.content.slice(own.content.indexOf('...]') + 4)
  assert.ok(
    afterMarker.trimStart().startsWith('- ') ||
      afterMarker.trimStart().startsWith('## '),
    'the tail starts mid-note: ' + JSON.stringify(afterMarker.slice(0, 40)),
  )
})

test('the other case variants of the file names are found too', async (t) => {
  const root = await makeTmpDir(t, 'zames-clip-')
  await mk(root, 'agents.md', 'lower rules')
  await mk(root, 'memory.md', 'lower memo')
  const ctx = await loadProjectContext(root)
  assert.ok(ctx.agents.some((f) => f.content === 'lower rules'))
  assert.ok(ctx.memory.some((f) => f.content === 'lower memo'))
})

test('a DIRECTORY named AGENTS.md is not read as a file', async (t) => {
  const root = await makeTmpDir(t, 'zames-clip-')
  await fs.mkdir(path.join(root, 'AGENTS.md'), { recursive: true })
  const ctx = await loadProjectContext(root)
  assert.ok(!ctx.agents.some((f) => f.path === path.join(root, 'AGENTS.md')))
})
