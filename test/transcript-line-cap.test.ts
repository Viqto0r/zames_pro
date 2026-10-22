import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Transcript } from '../src/transcript.ts'
import { makeTmpDir } from './tmp-dir.ts'

// A transcript line is written verbatim as one JSON object. A single `log`
// call carries whatever the caller passes — a tool result, a page dump, a
// fetched document — and NONE of it is capped here. One 5 MB `WebFetch`
// result therefore becomes a 5 MB line, and `/cost`/`/export` then load the
// whole thing into memory and print it. The transcript must stay a LOG: cap
// each line (with a marker), the same way a tool result is capped.
test('a huge logged payload is capped on the line', async (t) => {
  const dir = await makeTmpDir(t, 'zames-tr-cap-')
  const tr = new Transcript({ dir, enabled: true })
  tr.log('tool_result', { tool: 'WebFetch', result: 'x'.repeat(5_000_000) })
  await new Promise((r) => setTimeout(r, 150))
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'))
  assert.equal(files.length, 1)
  const body = await fs.readFile(path.join(dir, files[0]), 'utf-8')
  const line = body.split(String.fromCharCode(10)).find((l) => l.length > 0)
  assert.ok(line, 'no line written')
  assert.ok(
    line!.length <= 100_000,
    'the transcript line is ' + line!.length + ' chars',
  )
})
