import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { listTsFiles } from '../src/self-review.ts'

// Regression: self-review used to walk only the TOP level of src/ and take
// files ending in .ts, so src/i18n/*.ts and src/input/*.ts never entered a
// snapshot and /self-diff /self-apply silently ignored them (N4).

test('listTsFiles recurses into subdirectories', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-sr-'))
  await fs.mkdir(path.join(dir, 'i18n'), { recursive: true })
  await fs.mkdir(path.join(dir, 'input'), { recursive: true })
  await fs.writeFile(path.join(dir, 'top.ts'), '1', 'utf-8')
  await fs.writeFile(path.join(dir, 'i18n', 'catalog.ts'), '2', 'utf-8')
  await fs.writeFile(path.join(dir, 'input', 'layout.ts'), '3', 'utf-8')
  await fs.writeFile(path.join(dir, 'notes.md'), 'x', 'utf-8')

  const rels = (await listTsFiles(dir)).sort()
  assert.deepEqual(rels, ['i18n/catalog.ts', 'input/layout.ts', 'top.ts'])
  await fs.rm(dir, { recursive: true, force: true })
})

test('listTsFiles skips the read-only _context folder', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-sr2-'))
  await fs.mkdir(path.join(dir, '_context', 'scripts'), { recursive: true })
  await fs.writeFile(path.join(dir, 'a.ts'), '1', 'utf-8')
  await fs.writeFile(
    path.join(dir, '_context', 'scripts', 'x.ts'),
    '2',
    'utf-8',
  )
  const rels = await listTsFiles(dir)
  assert.deepEqual(rels, ['a.ts'])
  await fs.rm(dir, { recursive: true, force: true })
})
