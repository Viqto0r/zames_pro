import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { writeFileAtomic, writeJsonAtomic } from '../src/fsutil.ts'
import {
  createTools,
  filterToolsForReadOnly,
  MUTATING_TOOLS,
} from '../src/tools.ts'
import { createGitTools } from '../src/gitTools.ts'
import type { ToolDef } from '../src/types.ts'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zames-fsutil-'))
}

function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x['name'] === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

// ---------- fsutil ----------

test('writeFileAtomic создаёт файл и не оставляет tmp', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'x.json')
  writeFileAtomic(file, 'hello')
  assert.equal(fs.readFileSync(file, 'utf-8'), 'hello')
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'))
  assert.equal(leftovers.length, 0)
})

test('writeFileAtomic перезаписывает существующий файл', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'x.json')
  writeFileAtomic(file, 'a')
  writeFileAtomic(file, 'b')
  assert.equal(fs.readFileSync(file, 'utf-8'), 'b')
})

test('writeJsonAtomic пишет валидный JSON с переводом строки', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'c.json')
  writeJsonAtomic(file, { a: 1 })
  const raw = fs.readFileSync(file, 'utf-8')
  assert.ok(raw.endsWith(String.fromCharCode(10)))
  assert.deepEqual(JSON.parse(raw), { a: 1 })
})

test('writeFileAtomic creates the file with 0o600 permissions', () => {
  // N22: config.json holds the browser password in clear text, so the file
  // must not be world-readable (default umask would give 0644).
  if (process.platform === 'win32') return
  const dir = tmpDir()
  const file = path.join(dir, 'secret.json')
  writeFileAtomic(file, 'sensitive')
  const mode = fs.statSync(file).mode & 0o777
  assert.equal(mode, 0o600)
})

test('writeFileAtomic tightens the mode of a pre-existing file', () => {
  // rename() keeps the old inode, so a file created earlier with 0644 would
  // stay world-readable without an explicit chmod after rename.
  if (process.platform === 'win32') return
  const dir = tmpDir()
  const file = path.join(dir, 'old.json')
  fs.writeFileSync(file, 'old', { mode: 0o644 })
  writeFileAtomic(file, 'new')
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
})

// ---------- plan mode (read-only tools) ----------

test('filterToolsForReadOnly убирает все мутирующие инструменты', () => {
  const dir = tmpDir()
  const all = createTools(dir, {})
  const ro = filterToolsForReadOnly(all)
  for (const name of MUTATING_TOOLS) {
    assert.ok(!ro.some((t) => t.name === name), 'still has ' + name)
  }
  // Read tools survive.
  for (const keep of ['Read', 'Glob', 'Grep', 'LS', 'respond']) {
    assert.ok(
      ro.some((t) => t.name === keep),
      'missing ' + keep,
    )
  }
})

test('createTools({readOnly:true}) отдаёт тот же набор, что filterToolsForReadOnly', () => {
  const dir = tmpDir()
  const all = createTools(dir, {})
  const roDirect = createTools(dir, { readOnly: true })
  assert.deepEqual(
    roDirect.map((t) => t.name).sort(),
    filterToolsForReadOnly(all)
      .map((t) => t.name)
      .sort(),
  )
})

// ---------- GitPush branch validation ----------

test('GitPush отклоняет ветку с shell-метасимволами', async () => {
  const tools = createGitTools(process.cwd())
  const out = String(
    await tool(tools, 'GitPush').fn({ branch: 'main; rm -rf /' }),
  )
  assert.ok(/invalid branch name/i.test(out), out)
})

test('GitPush отклоняет ветку, начинающуюся с дефиса', async () => {
  const tools = createGitTools(process.cwd())
  const out = String(await tool(tools, 'GitPush').fn({ branch: '-f' }))
  assert.ok(/invalid branch name/i.test(out), out)
})

// ---------- atomic config write keeps the merge intact ----------

test('writeJsonAtomic поверх битого файла даёт валидный JSON', () => {
  const dir = tmpDir()
  const file = path.join(dir, 'cfg.json')
  fs.writeFileSync(file, '{ broken')
  writeJsonAtomic(file, { ok: true })
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf-8')), { ok: true })
})
