import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadProjectContext } from '../src/context.ts'
import { makeTmpDir } from './tmp-dir.ts'

// `clipIf` cuts a hand-maintained AGENTS.md / MEMORY.md to a per-file budget.
// The cut is in UTF-16 units, so a long file whose budget boundary lands in
// the MIDDLE of an emoji / astral CJK char used to hand the model a lone
// surrogate: the head clip ended with the HIGH half, the tail clip (MEMORY.md)
// STARTED with the LOW half. Either way the system prompt carried a broken
// code point (same rule as truncateToolResult / capReport / cutHookText).

const NL = String.fromCharCode(10)
const EMOJI = String.fromCodePoint(0x1f600)

// True when the string contains a surrogate that is not part of a pair.
function hasLoneSurrogate(s: string): boolean {
  const HIGH = 0xd800
  const LOW = 0xdbff
  const LOW_MIN = 0xdc00
  const LOW_MAX = 0xdfff
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= HIGH && c <= LOW) {
      const n = s.charCodeAt(i + 1)
      if (!(n >= LOW_MIN && n <= LOW_MAX)) return true
      i++
    } else if (c >= LOW_MIN && c <= LOW_MAX) {
      return true
    }
  }
  return false
}

async function mkTmp(t: {
  after: (fn: () => unknown) => unknown
}): Promise<string> {
  return await makeTmpDir(t, 'zames-clip-')
}

// AGENTS.md is head-clipped: the KEPT head must not end on a lone high half.
test('a head-clipped AGENTS.md does not end on a lone high surrogate', async (t) => {
  const root = await mkTmp(t)
  // The per-file budget for AGENTS.md is MAX_FILE_BASE (120000) and `clipIf`
  // keeps `budget - 120` units. Put a pair so the cut lands on its HIGH half.
  const keep = 120000 - 120
  const body = 'x'.repeat(keep - 1) + EMOJI + 'y'.repeat(500)
  await fs.writeFile(path.join(root, 'AGENTS.md'), body, 'utf-8')
  const ctx = await loadProjectContext(root)
  const agents = ctx.agents.find((f) => f.path.endsWith('AGENTS.md'))
  assert.ok(agents, 'AGENTS.md should be loaded')
  const head = agents!.content.split(NL + NL + '[...')[0]
  const last = head.charCodeAt(head.length - 1)
  assert.ok(
    !(last >= 0xd800 && last <= 0xdbff),
    'kept head ends with a lone high surrogate: ' + last.toString(16),
  )
})

// MEMORY.md is TAIL-clipped: the kept tail must not START on a lone low half.
test('a tail-clipped MEMORY.md does not start on a lone low surrogate', async (t) => {
  const root = await mkTmp(t)
  const keep = 200000 - 120
  const body = 'y'.repeat(500) + EMOJI + 'x'.repeat(keep - 1)
  await fs.writeFile(path.join(root, 'MEMORY.md'), body, 'utf-8')
  const ctx = await loadProjectContext(root)
  const mem = ctx.memory.find((f) => f.path.endsWith('MEMORY.md'))
  assert.ok(mem, 'MEMORY.md should be loaded')
  const marker = 'chars omitted) ...]'
  const at = mem!.content.indexOf(marker)
  assert.ok(at >= 0, 'the file should have been truncated')
  const tail = mem!.content.slice(at + marker.length).replace(/^[\r\n]+/, '')
  const first = tail.charCodeAt(0)
  assert.ok(
    !(first >= 0xdc00 && first <= 0xdfff),
    'kept tail starts with a lone low surrogate: ' + first.toString(16),
  )
})
