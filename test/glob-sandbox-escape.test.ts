// The Glob tool rejects a result that leaves the project root. The check was
// `rel.startsWith('..')` on the LEXICAL path only, so a glob pattern carrying
// `..` (or an absolute path inside the project) reported files OUTSIDE the
// root: `../**/*.ts` with cwd=root listed a sibling directory's files. The
// relative path it printed even started with `..`. sandbox.safePath() already
// does the lexical AND the symlink-real check — Glob must use it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.js'
import { createTools } from '../src/tools.js'
import { createTodoStore } from '../src/extraTools.ts'

test('Glob never reports a file outside the working directory', async (t) => {
  const parent = await makeTmpDir(t, 'zames-glob-root-')
  const root = path.join(parent, 'proj')
  const sibling = path.join(parent, 'other')
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(sibling, { recursive: true })
  fs.writeFileSync(path.join(sibling, 'secret.ts'), 'x')
  fs.writeFileSync(path.join(root, 'mine.ts'), 'x')

  const tools = createTools(root, {
    undo: undefined as never,
    todos: createTodoStore(),
  })
  const glob = tools.find((x) => x.name === 'Glob')!

  const out = String(await glob.fn({ pattern: '../**/*.ts', path: '.' }))
  assert.ok(
    !out.includes('secret.ts'),
    'a sibling directory file leaked: ' + out,
  )
  assert.ok(!/(^|\n)\.\.\//.test(out), 'a relative path escaped: ' + out)
})

test('Glob with an absolute pattern stays inside the project', async (t) => {
  const parent = await makeTmpDir(t, 'zames-glob-abs-')
  const root = path.join(parent, 'proj')
  const sibling = path.join(parent, 'other')
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(sibling, { recursive: true })
  fs.writeFileSync(path.join(sibling, 'secret.ts'), 'x')
  fs.writeFileSync(path.join(root, 'mine.ts'), 'x')

  const tools = createTools(root, {
    undo: undefined as never,
    todos: createTodoStore(),
  })
  const glob = tools.find((x) => x.name === 'Glob')!

  const out = String(
    await glob.fn({ pattern: path.join(sibling, '*.ts'), path: '.' }),
  )
  assert.ok(!out.includes('secret.ts'), 'absolute escape leaked: ' + out)
})
