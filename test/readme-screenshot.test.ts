import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The README hero screenshot is docs/demo.png — the operator's own capture,
// which the agent must NOT regenerate or replace (render-demo writes there, so
// the reference and the generator must agree). It used to point at a theme
// preview by mistake, which silently "broke the demo" in the published README.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(p: string): string {
  return fs.readFileSync(path.join(root, p), 'utf-8')
}

test('the README screenshots point at docs/demo.png', () => {
  for (const file of ['docs/readme.en.md', 'docs/readme.ru.md']) {
    const src = read(file)
    assert.ok(
      src.includes('master/docs/demo.png'),
      `${file}: the hero screenshot must reference docs/demo.png`,
    )
    assert.ok(
      !src.includes('master/docs/shots/'),
      `${file}: a theme preview is not the README screenshot`,
    )
  }
  assert.ok(fs.existsSync(path.join(root, 'docs', 'demo.png')))
})

test('render-demo writes the same file the README references', () => {
  const gen = read('scripts/render-demo.mts')
  assert.match(
    gen,
    /path\.join\(root, 'docs', 'demo\.png'\)/,
    'render-demo.mts must keep writing docs/demo.png',
  )
})
