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

// One source of truth: docs/demo.png is the LAST frame of docs/demo.gif (the
// operator's recording). It used to be a separate render of the old startup
// banner, which drifted from the real full-screen TUI.
test('docs/demo.png is the last frame of docs/demo.gif', () => {
  const png = fs.readFileSync(path.join(root, 'docs', 'demo.png'))
  assert.ok(
    png.subarray(1, 4).toString('ascii') === 'PNG',
    'docs/demo.png is not a PNG',
  )
  const gif = fs.readFileSync(path.join(root, 'docs', 'demo.gif'))
  assert.ok(
    gif.subarray(0, 6).toString('ascii').startsWith('GIF'),
    'docs/demo.gif is not a GIF',
  )
  // Same terminal, same aspect: demo.png is a DOWNSCALED last frame (the
  // README renders it at width=860), so only the proportion is comparable.
  const gifW = gif.readUInt16LE(6)
  const gifH = gif.readUInt16LE(8)
  const pngW = png.readUInt32BE(16)
  const pngH = png.readUInt32BE(20)
  const gifRatio = gifW / gifH
  const pngRatio = pngW / pngH
  assert.ok(
    Math.abs(gifRatio - pngRatio) < 0.05,
    `demo.png (${pngW}x${pngH}) is not the shape of demo.gif (${gifW}x${gifH})`,
  )
})
