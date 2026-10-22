import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.ts'

// The TodoWrite checklist is saved with the session. Nothing caps it, so a
// model that keeps adding items grows `~/.zames/.sessions/<id>.json` without
// bound — and the session file is READ on every startup/restore. A checklist
// is a UI indicator, not a database: keep a sane maximum (the newest entries).
test('a runaway todo list is capped in the session file', async (t) => {
  const home = await makeTmpDir(t, 'zames-todos-')
  const prev = process.env.HOME
  process.env.HOME = home
  try {
    const mod = await import(
      '../src/sessions.ts?fresh=' + Math.random().toString(36).slice(2)
    )
    const todos = Array.from({ length: 5000 }, (_, i) => ({
      content: 'task ' + i,
      status: 'pending',
    }))
    mod.saveSession({ id: 'big', title: 't', workdir: '/w', todos })
    const raw = JSON.parse(
      await fs.readFile(
        path.join(home, '.zames', '.sessions', 'big.json'),
        'utf-8',
      ),
    )
    assert.ok(
      raw.todos.length <= 1000,
      'session stores ' + raw.todos.length + ' todo items',
    )
  } finally {
    process.env.HOME = prev
  }
})
