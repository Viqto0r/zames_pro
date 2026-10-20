import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.ts'
import { rotateTranscripts } from '../src/transcript.ts'
import { rotateNetLog } from '../src/net-capture.ts'

// The agent writes two unbounded directories: ~/.zames/logs (one transcript
// file per run) and ~/.zames/net-log (one file per network response under
// ZAMES_NET_DEBUG=1, which `npm run dev` sets). On WSL both live inside
// ext4.vhdx, where the space of thousands of deleted tiny files never returns
// to the Windows host — the disk filled up. Both directories are now rotated,
// so the rotation itself is the thing worth testing.

const NI = String.fromCharCode(10)
const BODY = '{}' + NI

test('transcript rotation keeps the newest files and drops the rest', async (t) => {
  const dir = await makeTmpDir(t, 'zames-logrot-')
  // Names sort chronologically (the ISO stamp is the prefix).
  for (const stamp of [
    '2026-01-01T00-00-00-000Z',
    '2026-01-02T00-00-00-000Z',
    '2026-01-03T00-00-00-000Z',
    '2026-01-04T00-00-00-000Z',
  ]) {
    await fs.writeFile(path.join(dir, stamp + '-proj.jsonl'), BODY, 'utf-8')
  }
  // A non-transcript file must survive: only *.jsonl are rotated.
  await fs.writeFile(path.join(dir, 'notes.txt'), 'keep', 'utf-8')

  const removed = rotateTranscripts(dir, 2)
  assert.equal(removed, 2)
  const left = (await fs.readdir(dir)).sort()
  assert.deepEqual(left, [
    '2026-01-03T00-00-00-000Z-proj.jsonl',
    '2026-01-04T00-00-00-000Z-proj.jsonl',
    'notes.txt',
  ])
})

test('transcript rotation is a no-op below the cap and on a missing dir', async (t) => {
  const dir = await makeTmpDir(t, 'zames-logrot2-')
  await fs.writeFile(path.join(dir, 'a-proj.jsonl'), BODY, 'utf-8')
  assert.equal(rotateTranscripts(dir, 10), 0)
  assert.equal(rotateTranscripts(path.join(dir, 'missing'), 10), 0)
})

test('net-log rotation keeps only the newest dumps', async (t) => {
  const dir = await makeTmpDir(t, 'zames-netrot-')
  for (let i = 0; i < 5; i++) {
    // Same shape dumpNetBody writes: an ISO stamp prefix, then the URL.
    await fs.writeFile(
      path.join(
        dir,
        '2026-01-0' + (i + 1) + 'T00-00-00-000Z_https___chat_deepseek_com.txt',
      ),
      'body',
      'utf-8',
    )
  }
  const removed = await rotateNetLog(dir, 2)
  assert.equal(removed, 3)
  const left = (await fs.readdir(dir)).sort()
  assert.equal(left.length, 2)
  assert.ok(left[0].startsWith('2026-01-04'), left[0])
  assert.ok(left[1].startsWith('2026-01-05'), left[1])
})

test('net-log rotation is a no-op below the cap', async (t) => {
  const dir = await makeTmpDir(t, 'zames-netrot2-')
  await fs.writeFile(path.join(dir, '2026-01-01T00-00-00-000Z_x.txt'), 'b')
  assert.equal(await rotateNetLog(dir, 10), 0)
  assert.equal(await rotateNetLog(path.join(dir, 'missing'), 10), 0)
})

test('the transcript constructor rotates the directory it writes into', async (t) => {
  const dir = await makeTmpDir(t, 'zames-logrot3-')
  // Fill the dir past the cap with OLD names (lexicographically smaller).
  for (let i = 0; i < 205; i++) {
    const stamp = '2020-01-01T00-00-' + String(i).padStart(2, '0') + '-000Z'
    await fs.writeFile(path.join(dir, stamp + '-old.jsonl'), BODY, 'utf-8')
  }
  // Importing is cheap; the constructor is sync and rotates before creating.
  const { Transcript } = await import('../src/transcript.ts')
  const tr = new Transcript({ dir, enabled: true, sessionName: 'proj' })
  await tr.close()
  const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.jsonl'))
  assert.ok(names.length <= 201, 'rotated: ' + names.length)
  assert.ok(
    names.some((n) => n.includes('proj')),
    'the new transcript exists',
  )
  assert.ok(
    !names.some((n) => n.startsWith('2020-01-01T00-00-00')),
    'the oldest file was removed',
  )
  assert.ok(fsSync.existsSync(tr.file as string))
})
