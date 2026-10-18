import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createTools } from '../src/tools.ts'
import type { ToolDef } from '../src/types.ts'

// Read's `offset`/`limit` are 1-BASED, like every other line-numbered tool
// (sed, awk, `git blame -L`, the `numbered=true` output this very tool prints).
// The tool used to treat them as 0-BASED array slices, so a model asking for
// "lines 5..7" (`offset: 5, limit: 3`) got lines 6..8 — silently shifted by
// one — and `offset: 1` SKIPPED the first line instead of starting at it.
// The `numbered` prefix made the discrepancy invisible: it numbered the
// WRONG lines and the numbers it printed were the offset values, not the
// real line numbers.

const NL = String.fromCharCode(10)

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

async function setup(): Promise<{ dir: string; tools: ToolDef[] }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-offset-'))
  const lines = Array.from({ length: 10 }, (_, i) => 'line' + (i + 1))
  await fs.writeFile(path.join(dir, 'f.txt'), lines.join(NL), 'utf-8')
  return { dir, tools: createTools(dir) }
}

test('Read: offset is 1-based (offset 5 starts at line 5)', async () => {
  const { dir, tools } = await setup()
  const out = String(
    await tool(tools, 'Read').fn({ path: 'f.txt', offset: 5, limit: 2 }),
  )
  assert.equal(out, ['line5', 'line6'].join(NL))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read: offset 1 returns the first line', async () => {
  const { dir, tools } = await setup()
  const out = String(
    await tool(tools, 'Read').fn({ path: 'f.txt', offset: 1, limit: 1 }),
  )
  assert.equal(out, 'line1')
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read: limit alone reads the first lines', async () => {
  const { dir, tools } = await setup()
  const out = String(await tool(tools, 'Read').fn({ path: 'f.txt', limit: 2 }))
  assert.equal(out, ['line1', 'line2'].join(NL))
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read: numbered output numbers the REAL lines', async () => {
  const { dir, tools } = await setup()
  const out = String(
    await tool(tools, 'Read').fn({
      path: 'f.txt',
      offset: 5,
      limit: 2,
      numbered: true,
    }),
  )
  assert.equal(out, '5\tline5' + NL + '6\tline6')
  await fs.rm(dir, { recursive: true, force: true })
})

test('Read: offset past the end returns an empty string', async () => {
  const { dir, tools } = await setup()
  const out = String(
    await tool(tools, 'Read').fn({ path: 'f.txt', offset: 100, limit: 5 }),
  )
  assert.equal(out, '')
  await fs.rm(dir, { recursive: true, force: true })
})
