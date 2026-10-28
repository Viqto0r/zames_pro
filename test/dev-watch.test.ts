import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HOT_RELOADABLE,
  nonReloadableSources,
  diffChanged,
} from '../src/dev-watch.ts'

// In dev mode an edit to a module that is NOT hot-reloadable silently keeps
// running the OLD copy. The watcher must cover the WHOLE non-reloadable set —
// not just browser.ts — and name the changed files once.

const srcDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
)

test('every hot-reloadable name is a real module', () => {
  const files = nonReloadableSources(srcDir)
  const bases = new Set(
    files.map((f) => path.basename(f).replace(/\.tsx?$/, '')),
  )
  for (const name of HOT_RELOADABLE) {
    assert.equal(
      bases.has(name),
      false,
      'a hot-reloadable module must not be watched: ' + name,
    )
  }
})

test('the non-reloadable set includes the entry points and browsers', () => {
  const files = nonReloadableSources(srcDir)
  const bases = files.map((f) => path.basename(f))
  for (const name of [
    'index.ts',
    'browser.ts',
    'qwen-browser.ts',
    'glm-browser.ts',
    'browser-login.ts',
  ]) {
    assert.ok(bases.includes(name), 'not watched: ' + name)
  }
  // The Ink TUI is not reloadable either (its files live in src/tui/).
  assert.ok(
    files.some((f) => f.includes(path.join('tui', ''))),
    'the TUI files are not watched',
  )
})

test('a hot-reloadable module is excluded from the watch list', () => {
  const files = nonReloadableSources(srcDir)
  assert.equal(
    files.some((f) => path.basename(f) === 'tools.ts'),
    false,
    'tools.ts is hot-reloadable and must not be watched',
  )
})

test('diffChanged reports only files whose mtime moved', () => {
  const prev = new Map<string, number>()
  const files = nonReloadableSources(srcDir)
  // First pass only records the snapshot (nothing changed yet).
  assert.deepEqual(diffChanged(files, prev), [])
  assert.equal(prev.size, files.length)
  // Simulate an edit of one file.
  const target = files[0]
  prev.set(target, -1)
  assert.deepEqual(diffChanged(files, prev), [target])
})
