// writeFileAtomic() follows a SYMLINK so a dotfiles setup keeps the link
// instead of replacing it with a regular file (the earlier fix). But
// `fs.realpathSync` THROWS for a broken/not-yet-existing target, and the code
// then writes to the LINK PATH itself: `renameSync` replaces the symlink with
// a plain file and the real target is never created. A dotfiles link
// (`~/.zames/config.json -> ~/dotfiles/zames/config.json` before the first
// clone/checkout) silently becomes a regular file in `~/.zames`, so the next
// edit no longer reaches the repo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { writeFileAtomic } from '../src/fsutil.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

test('a DANGLING symlink is written THROUGH, not replaced', (t) => {
  const dir = makeTmpDirSync(t, 'zames-fsu-dangling-')
  fs.mkdirSync(path.join(dir, 'repo'))
  const target = path.join(dir, 'repo', 'config.json')
  const link = path.join(dir, 'config.json')
  fs.symlinkSync(target, link)
  writeFileAtomic(link, '{"a":1}')
  assert.equal(
    fs.lstatSync(link).isSymbolicLink(),
    true,
    'the link was replaced',
  )
  assert.equal(fs.readFileSync(target, 'utf-8'), '{"a":1}')
})
