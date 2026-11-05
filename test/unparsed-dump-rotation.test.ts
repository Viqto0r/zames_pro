import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.ts'
import { dumpUnparsedCall } from '../src/agent-loop.ts'

// `npm run dev` turns the dev dump on, and `dumpUnparsedCall` used to stop
// writing after UNPARSED_DUMP_MAX files per PROCESS without ever removing an
// old one. A long /loop run is one process, so the directory only ever grew:
// the project `.zames/unparsed` reached 93 files against a cap of 20. The
// sibling net-log dump already rotates (see rotateNetLog) for exactly this
// reason, so the dev dump must keep a BOUNDED directory too.

// Every test here writes a `.zames/unparsed` directory under its own tmp
// workdir, so the operator's project is never touched.
async function dumpsIn(workdir: string): Promise<string[]> {
  const dir = path.join(workdir, '.zames', 'unparsed')
  return (await fs.readdir(dir).catch(() => [] as string[])).filter((n) =>
    n.endsWith('.txt'),
  )
}

test('the dev dump keeps the directory bounded instead of growing forever', async (t) => {
  const workdir = await makeTmpDir(t)
  // Comfortably past the cap so a per-process stop cannot hide the bug.
  for (let i = 0; i < 30; i++) {
    const file = await dumpUnparsedCall('{"tool":"Read"', {
      provider: 'deepseek',
      where: 'loop:unparsed',
      workdir,
    })
    assert.ok(file, 'dump #' + i + ' was not written')
  }
  const files = await dumpsIn(workdir)
  assert.ok(
    files.length <= 20,
    'the unparsed dump directory grew to ' + files.length + ' files',
  )
  // The newest dump must survive: a rotation that deletes what it just wrote
  // would leave nothing to analyse.
  const newest = (await fs.readdir(path.join(workdir, '.zames', 'unparsed')))
    .filter((n) => n.endsWith('.txt'))
    .sort()
    .pop()
  assert.ok(newest, 'no dump survived the rotation')
})

test('a foreign file in the dump dir is never deleted', async (t) => {
  const workdir = await makeTmpDir(t)
  const dir = path.join(workdir, '.zames', 'unparsed')
  await fs.mkdir(dir, { recursive: true })
  const foreign = path.join(dir, 'operator-notes.txt')
  await fs.writeFile(foreign, 'keep me', 'utf-8')
  for (let i = 0; i < 25; i++) {
    await dumpUnparsedCall('{"tool":"Read"', {
      provider: 'deepseek',
      where: 'loop:unparsed',
      workdir,
    })
  }
  const kept = await fs.readFile(foreign, 'utf-8').catch(() => null)
  assert.equal(kept, 'keep me', 'a foreign file was deleted by the rotation')
})
