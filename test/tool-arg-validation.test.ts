import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTools } from '../src/tools.js'
import { makeTmpDir } from './tmp-dir.js'

// The tool contract says `path: string`, but nothing enforced it: a call whose
// `path` was an OBJECT went through `String(v)` -> "[object Object]" and the
// Write tool CREATED a file with that literal name (the same family as the old
// `undefined` file). This is exactly the shape a garbled tool call takes.

const tool = (dir: string, name: string) => {
  const found = createTools(dir, {}).find((t) => t.name === name)
  assert.ok(found, 'tool ' + name)
  return found!
}

test('Write rejects a non-string path', async (t) => {
  const dir = await makeTmpDir(t, 'zames-argtype-')
  await assert.rejects(
    async () =>
      tool(dir, 'Write').fn({ path: { file: 'a' }, content: 'x' } as never),
    /path/i,
  )
})

test('Read rejects a non-string path', async (t) => {
  const dir = await makeTmpDir(t, 'zames-argtype-')
  await assert.rejects(
    async () => tool(dir, 'Read').fn({ path: ['a'] } as never),
    /path/i,
  )
})

test('a real path still works', async (t) => {
  const dir = await makeTmpDir(t, 'zames-argtype-')
  const out = await tool(dir, 'Write').fn({
    path: 'a.txt',
    content: 'hi',
  } as never)
  assert.match(String(out), /a\.txt/)
})
