import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The README hero is docs/demo.gif — the operator's own recording, which the
// agent must NOT regenerate. A static PNG was tried before and drifted from
// the real TUI (it was a render of the old startup banner), so the GIF is the
// single source of truth: the README shows the SAME thing the site shows.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(p: string): string {
  return fs.readFileSync(path.join(root, p), 'utf-8')
}

test('the READMEs show the recorded demo gif', () => {
  for (const file of [
    'README.md',
    'docs/readme.en.md',
    'docs/readme.ru.md',
    'docs/readme/en.md',
    'docs/readme/ru.md',
  ]) {
    const src = read(file)
    assert.ok(
      src.includes('master/docs/demo.gif'),
      `${file}: the hero must reference docs/demo.gif`,
    )
    assert.ok(
      !src.includes('master/docs/demo.png'),
      `${file}: the removed demo.png is still referenced`,
    )
    assert.ok(
      !src.includes('master/docs/shots/'),
      `${file}: a theme preview is not the README screenshot`,
    )
  }
})

test('docs/demo.gif is the recorded demo and nothing generates it', () => {
  const gif = path.join(root, 'docs', 'demo.gif')
  assert.ok(fs.existsSync(gif), 'docs/demo.gif is missing')
  const head = fs.readFileSync(gif).subarray(0, 6).toString('ascii')
  assert.ok(head === 'GIF87a' || head === 'GIF89a', 'not a GIF')
  assert.ok(
    !fs.existsSync(path.join(root, 'docs', 'demo.png')),
    'docs/demo.png came back: the GIF is the only demo',
  )
  assert.ok(
    !fs.existsSync(path.join(root, 'scripts', 'render-demo.mts')),
    'render-demo.mts came back and would drift from the recording',
  )
})
