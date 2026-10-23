import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { loadCommands } from '../src/context.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

const NL = String.fromCharCode(10)
const BOM = String.fromCharCode(0xfeff)

// `skillBody` strips a leading BOM before checking for frontmatter, but
// `parseFrontmatter` did NOT: a command/skill file saved with a BOM (Windows
// editors and generators add one) failed `startsWith('---')`, so its
// `description`, `argument-hint` and `arguments` were all silently LOST — the
// «/» hint showed the command with an EMPTY description and the declared
// mandatory arguments were not enforced.
test('a BOM before the frontmatter does not drop the metadata', async (t) => {
  const wd = makeTmpDirSync(t, 'zames-cmd-')
  const dir = path.join(wd, '.zames', 'commands')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'mycmd.md'),
    BOM +
      [
        '---',
        'description: does x',
        'argument-hint: <file>',
        'arguments: file',
        '---',
        'Body $1',
      ].join(NL),
  )
  const cmds = await loadCommands(wd)
  assert.equal(cmds.length, 1)
  assert.equal(cmds[0].description, 'does x')
  assert.equal(cmds[0].argumentHint, '<file>')
  assert.deepEqual(cmds[0].arguments, ['file'])
})
