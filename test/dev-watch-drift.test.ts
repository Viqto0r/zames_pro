import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOT_RELOADABLE, nonReloadableSources } from '../src/dev-watch.ts'

// dev-watch.ts claims its HOT_RELOADABLE list cannot drift from index.ts's
// RELOADABLE, but nothing compared them: index.ts gained `restore-history` and
// `input/layout`, and the watcher kept listing BOTH as "not reloadable". In dev
// mode every edit to such a module then printed a FALSE "restart zames"
// warning even though /reload swaps it — the warning the watcher exists to make
// trustworthy.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function indexReloadable(): string[] {
  const src = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf-8')
  const start = src.indexOf('const RELOADABLE = [')
  assert.ok(start >= 0, 'RELOADABLE not found in index.ts')
  const end = src.indexOf(']', start)
  // Comments inside the block are NOT entries: a comment quoting a module
  // (`// 'input/layout' is NOT listed`) used to be read as a real entry, so
  // the drift check demanded a hot entry the code deliberately omits.
  const block = src
    .slice(start, end)
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join(String.fromCharCode(10))
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

test('every hot-reloadable module of index.ts is in HOT_RELOADABLE', () => {
  const missing = indexReloadable()
    .map((n) => path.basename(n))
    .filter((n) => !HOT_RELOADABLE.has(n))
  assert.deepEqual(
    missing,
    [],
    'index.ts reloads these, the watcher would warn about them: ' +
      missing.join(', '),
  )
})

test('a hot-reloadable module is not reported as needing a restart', () => {
  const files = nonReloadableSources(path.join(root, 'src'), HOT_RELOADABLE)
  const bases = new Set(files.map((f) => path.basename(f)))
  for (const name of ['restore-history.ts', 'commands.ts', 'tools.ts']) {
    assert.equal(
      bases.has(name),
      false,
      name + ' is hot-reloadable and must not be watched',
    )
  }
})
