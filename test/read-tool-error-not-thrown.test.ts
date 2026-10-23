import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.ts'
import { createTools } from '../src/tools.ts'

// The Read tool's own contract (its description) is that a failure comes back
// as TEXT the model reads: "an image returns its path/size as a marker … other
// binaries return a short hex header instead of mojibake". For a path that does
// not exist (or names a directory) it instead let the raw Node error escape
// from `fs.readFile`. The agent loop turns that into `Error: ENOENT: no such
// file or directory, open '/abs/path'` — a POSIX-specific message that leaks
// the ABSOLUTE server path and tells the model nothing actionable ("did the
// sandbox refuse it? is the file empty? is the path a directory?"). The tool
// must answer in its own words, like every other tool.
async function readWith(t: { after: (f: () => unknown) => unknown }) {
  const wd = await makeTmpDir(t, 'zames-read-')
  const tool = createTools(wd).find((x) => x.name === 'Read')!
  return { wd, tool }
}

test('Read reports a missing file instead of throwing ENOENT', async (t) => {
  const { tool } = await readWith(t)
  const out = String(await tool.fn({ path: 'nope.txt' }))
  assert.match(out, /not found|does not exist|no such file/i)
  assert.doesNotMatch(out, /^Error: ENOENT/)
})

test('Read reports a directory instead of throwing EISDIR', async (t) => {
  const { wd, tool } = await readWith(t)
  fs.mkdirSync(path.join(wd, 'sub'))
  const out = String(await tool.fn({ path: 'sub' }))
  assert.match(out, /director/i)
  assert.doesNotMatch(out, /^Error: EISDIR/)
})
