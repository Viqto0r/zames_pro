import { rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// tsc emits into dist/ without clearing it, so a source file DELETED from
// src/ leaves an orphan .js in the published tree (this really happened:
// dist/confirm.js survived after src/confirm.ts was removed). Wipe dist/ first
// so the build output mirrors src/ exactly.
//
// Cross-platform: use node's fs.rm instead of a shell `rm -rf` (Windows has no
// rm) and never touch anything outside this repo.
const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '..', 'dist')
if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true })
  console.log('clean-dist: removed', dist)
}
