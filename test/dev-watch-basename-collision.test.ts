import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { nonReloadableSources } from '../src/dev-watch.ts'

// The dev watcher reports a source file that /reload CANNOT hot-swap, so an
// edit to it does not silently keep running the old copy. It decides by
// BASENAME (the extension is stripped, the folder is ignored), and the hot
// list carries a name that exists in TWO folders: `layout`
// (src/input/layout.ts AND src/tui/layout.ts).
//
// So editing src/tui/layout.ts (the Ink layout, NOT hot-reloadable) never
// warned: the basename `layout` was marked hot because of the OTHER file.
// The operator kept seeing the old layout and had no hint to restart.

export function makeTree(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'zames-devwatch-'))
  mkdirSync(path.join(dir, 'input'))
  mkdirSync(path.join(dir, 'tui'))
  writeFileSync(path.join(dir, 'input', 'layout.ts'), 'export const a = 1')
  writeFileSync(path.join(dir, 'tui', 'layout.ts'), 'export const b = 1')
  return dir
}

test('a module with the same basename in another folder is still reported', (t) => {
  const dir = makeTree(t)
  const reported = nonReloadableSources(dir).map((f) => path.relative(dir, f))
  assert.ok(
    reported.includes(path.join('tui', 'layout.ts')),
    'src/tui/layout.ts is not hot-reloadable but was not reported: ' +
      JSON.stringify(reported),
  )
  // Neither file is hot in the REAL list (index.ts does not reload
  // `input/layout` either), so both are reported; what matters is that the
  // `tui/` twin is no longer silenced by its namesake.
})
