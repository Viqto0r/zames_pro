import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { applyUpdateHunk, createExtraTools } from '../src/extraTools.ts'
import { makeTmpDir } from './tmp-dir.ts'

const NL = String.fromCharCode(10)

// An INSERTION-ONLY hunk (`@@ -1,0 +1,1 @@` + a lone `+line`) is a normal
// unified-diff form: the model appends a line to a file this way. The apply
// code rejected it with "Hunk has no context or removed lines to anchor on",
// so an otherwise valid Update File always failed.
test('applyUpdateHunk applies an insertion-only hunk from a @@ header', () => {
  const content = ['a', 'b'].join(NL)
  const res = applyUpdateHunk(content, ['@@ -0,0 +1,1 @@', '+first'])
  assert.equal(res.ok, true, res.error ?? 'expected ok')
  assert.equal(res.content as string, ['first', 'a', 'b'].join(NL))
})

// Without a header an insertion has no position: still an error, and the
// message must say WHICH hunk failed, not claim the context was not found.
test('an insertion-only hunk without @@ is still rejected', () => {
  const res = applyUpdateHunk('a', ['+x'])
  assert.equal(res.ok, false)
  assert.ok(res.error)
})

// End-to-end: the model updates a file by appending a line.
test('ApplyPatch appends a line with an insertion-only hunk', async (t) => {
  const dir = await makeTmpDir(t, 'zames-apins-')
  await fs.writeFile(path.join(dir, 'f.txt'), ['a', 'b'].join(NL), 'utf-8')
  const tools = createExtraTools(dir, {})
  const tool = tools.find((x) => x.name === 'ApplyPatch')
  assert.ok(tool)
  const patch = [
    '*** Begin Patch',
    '*** Update File: f.txt',
    '@@ -3,0 +3,1 @@',
    '+c',
    '*** End Patch',
  ].join(NL)
  await tool.fn({ patch })
  assert.equal(
    await fs.readFile(path.join(dir, 'f.txt'), 'utf-8'),
    ['a', 'b', 'c'].join(NL),
  )
})
