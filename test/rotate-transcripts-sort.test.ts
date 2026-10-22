import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { rotateTranscripts } from '../src/transcript.ts'
import { makeTmpDir } from './tmp-dir.ts'

// Rotation keeps the newest files by sorting the NAMES. The name is
// `<sessionName>-<ISO stamp>.jsonl`, and `sessionName` is the WORKDIR label,
// so different projects share one log dir: the sort is then dominated by the
// label, not the stamp. A project named `aaa` keeps being deleted while `zzz`
// files survive forever, and the CURRENT run's transcript can be pruned
// because its name sorts first.
test('rotation keeps the newest by STAMP, not by the name prefix', async (t) => {
  const dir = await makeTmpDir(t, 'zames-rot-')
  // `aaa` is the newest, `zzz` the oldest — a plain name sort deletes `aaa`.
  await fs.writeFile(path.join(dir, 'aaa-2026-01-05T00-00-00-000Z.jsonl'), 'x')
  await fs.writeFile(path.join(dir, 'zzz-2026-01-04T00-00-00-000Z.jsonl'), 'x')
  await fs.writeFile(path.join(dir, 'zzz-2026-01-03T00-00-00-000Z.jsonl'), 'x')
  const removed = rotateTranscripts(dir, 2)
  assert.equal(removed, 1)
  const left = (await fs.readdir(dir)).sort()
  assert.ok(
    left.includes('aaa-2026-01-05T00-00-00-000Z.jsonl'),
    'the newest transcript was deleted: ' + left.join(', '),
  )
})
