import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { dumpUnparsedCall } from '../src/agent-loop.ts'

test('dumpUnparsedCall writes the raw answer', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-dump-'))
  const file = await dumpUnparsedCall('raw-answer', {
    provider: 'deepseek',
    where: 'watchdog',
    workdir: dir,
  })
  assert.ok(file)
  const text = await fs.readFile(file, 'utf8')
  assert.match(text, /watchdog/)
  await fs.rm(dir, { recursive: true, force: true })
})
